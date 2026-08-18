const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();

app.use(cors());
app.use(express.json());


// =========================================================
// CONFIGURAÇÕES
// =========================================================

const PORT = 3000;


// =========================================================
// CONEXÃO COM MYSQL
// =========================================================

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 20179),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    ssl: {
        rejectUnauthorized: false
    },

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


// =========================================================
// TESTAR CONEXÃO COM BANCO
// =========================================================

async function testarBanco() {

    try {

        const connection = await db.getConnection();

        console.log("MySQL conectado com sucesso.");

        connection.release();

    } catch (error) {

        console.error(
            "Erro ao conectar ao MySQL:",
            error.message
        );

    }
}


// =========================================================
// ROTA PRINCIPAL
// =========================================================

app.get("/", (req, res) => {

    res.json({
        sucesso: true,
        mensagem: "API da Tenda do Cuidar funcionando!"
    });

});


// =========================================================
// PROFISSIONAIS
// =========================================================

app.get("/profissionais", async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT
                id,
                nome,
                especialidade,
                ativo,
                agenda_disponivel
            FROM profissionais
            WHERE ativo = TRUE
            ORDER BY nome
        `);

        res.json(rows);

    } catch (error) {

        console.error(
            "Erro ao buscar profissionais:",
            error
        );

        res.status(500).json({
            sucesso: false,
            erro: "Erro ao buscar profissionais."
        });

    }

});


// =========================================================
// BUSCAR UM PROFISSIONAL
// =========================================================

app.get("/profissionais/:id", async (req, res) => {

    try {

        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID do profissional inválido."
            });

        }

        const [rows] = await db.query(`
            SELECT
                id,
                nome,
                especialidade,
                ativo,
                agenda_disponivel
            FROM profissionais
            WHERE id = ?
              AND ativo = TRUE
            LIMIT 1
        `, [id]);

        if (rows.length === 0) {

            return res.status(404).json({
                sucesso: false,
                erro: "Profissional não encontrado."
            });

        }

        res.json(rows[0]);

    } catch (error) {

        console.error(
            "Erro ao buscar profissional:",
            error
        );

        res.status(500).json({
            sucesso: false,
            erro: "Erro ao buscar profissional."
        });

    }

});


// =========================================================
// DISPONIBILIDADES DO PROFISSIONAL
// =========================================================

app.get("/disponibilidades/:profissionalId", async (req, res) => {

    try {

        const profissionalId =
            Number(req.params.profissionalId);

        if (
            !Number.isInteger(profissionalId) ||
            profissionalId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID do profissional inválido."
            });

        }

        const [rows] = await db.query(`
            SELECT
                id,
                profissional_id,
                dia_semana,
                hora_inicio,
                hora_fim,
                duracao_minutos,
                ativo
            FROM disponibilidades
            WHERE profissional_id = ?
              AND ativo = TRUE
            ORDER BY
                dia_semana,
                hora_inicio
        `, [profissionalId]);

        res.json(rows);

    } catch (error) {

        console.error(
            "Erro ao buscar disponibilidades:",
            error
        );

        res.status(500).json({
            sucesso: false,
            erro: "Erro ao buscar disponibilidades."
        });

    }

});


// =========================================================
// HORÁRIOS DE UMA DATA ESPECÍFICA
// =========================================================

app.get(
    "/horarios/:profissionalId/:data",
    async (req, res) => {

        try {

            const profissionalId =
                Number(req.params.profissionalId);

            const data =
                req.params.data;


            // -------------------------------------------------
            // VALIDAR PROFISSIONAL
            // -------------------------------------------------

            if (
                !Number.isInteger(profissionalId) ||
                profissionalId <= 0
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro: "Profissional inválido."
                });

            }


            // -------------------------------------------------
            // VALIDAR DATA
            // -------------------------------------------------

            if (!validarData(data)) {

                return res.status(400).json({
                    sucesso: false,
                    erro: "Data inválida. Use o formato YYYY-MM-DD."
                });

            }


            // -------------------------------------------------
            // VERIFICAR SE PROFISSIONAL EXISTE
            // -------------------------------------------------

            const [profissional] = await db.query(`
                SELECT
                    id,
                    nome,
                    ativo,
                    agenda_disponivel
                FROM profissionais
                WHERE id = ?
                LIMIT 1
            `, [profissionalId]);


            if (profissional.length === 0) {

                return res.status(404).json({
                    sucesso: false,
                    erro: "Profissional não encontrado."
                });

            }


            if (!profissional[0].ativo) {

                return res.json([]);

            }


            if (!profissional[0].agenda_disponivel) {

                return res.json([]);

            }


            // -------------------------------------------------
            // DESCOBRIR DIA DA SEMANA
            // -------------------------------------------------

            const diaSemana =
                obterDiaSemana(data);


            // Domingo = 0
            // Segunda = 1
            // Terça = 2
            // Quarta = 3
            // Quinta = 4
            // Sexta = 5
            // Sábado = 6

            if (
                diaSemana === 0 ||
                diaSemana === 6
            ) {

                return res.json([]);

            }


            // -------------------------------------------------
            // BUSCAR DISPONIBILIDADES
            // -------------------------------------------------

            const [disponibilidades] =
                await db.query(`

                    SELECT
                        hora_inicio,
                        hora_fim,
                        duracao_minutos

                    FROM disponibilidades

                    WHERE profissional_id = ?
                      AND dia_semana = ?
                      AND ativo = TRUE

                    ORDER BY hora_inicio

                `, [
                    profissionalId,
                    diaSemana
                ]);


            if (disponibilidades.length === 0) {

                return res.json([]);

            }


            // -------------------------------------------------
            // BUSCAR AGENDAMENTOS DO DIA
            // -------------------------------------------------

            const [agendamentos] =
                await db.query(`

                    SELECT
                        hora_inicio,
                        hora_fim,
                        status

                    FROM agendamentos

                    WHERE profissional_id = ?
                      AND data_consulta = ?

                `, [
                    profissionalId,
                    data
                ]);


            // -------------------------------------------------
            // GERAR HORÁRIOS
            // -------------------------------------------------

            const horarios = [];


            disponibilidades.forEach(
                disponibilidade => {

                    const inicioDisponibilidade =
                        converterParaMinutos(
                            disponibilidade.hora_inicio
                        );


                    const fimDisponibilidade =
                        converterParaMinutos(
                            disponibilidade.hora_fim
                        );


                    const duracao =
                        Number(
                            disponibilidade.duracao_minutos
                        ) || 50;


                    let inicio =
                        inicioDisponibilidade;


                    while (
                        inicio + duracao <=
                        fimDisponibilidade
                    ) {

                        const fim =
                            inicio + duracao;


                        const horaInicio =
                            minutosParaHora(inicio);


                        const horaFim =
                            minutosParaHora(fim);


                        // -------------------------------------
                        // VERIFICAR CONFLITO
                        // -------------------------------------

                        const ocupado =
                            agendamentos.some(
                                agendamento => {

                                    // Cancelado não ocupa horário
                                    if (
                                        String(
                                            agendamento.status
                                        ).toLowerCase() ===
                                        "cancelado"
                                    ) {

                                        return false;

                                    }


                                    const agInicio =
                                        converterParaMinutos(
                                            agendamento.hora_inicio
                                        );


                                    const agFim =
                                        converterParaMinutos(
                                            agendamento.hora_fim
                                        );


                                    return (
                                        inicio < agFim &&
                                        fim > agInicio
                                    );

                                }
                            );


                        horarios.push({

                            inicio:
                                horaInicio,

                            fim:
                                horaFim,

                            disponivel:
                                !ocupado

                        });


                        inicio += duracao + 10;

                    }

                }
            );


            // -------------------------------------------------
            // REMOVER DUPLICIDADES
            // -------------------------------------------------

            const horariosUnicos =
                Array.from(

                    new Map(

                        horarios.map(
                            horario => [
                                `${horario.inicio}-${horario.fim}`,
                                horario
                            ]
                        )

                    ).values()

                );


            // -------------------------------------------------
            // ORDENAR HORÁRIOS
            // -------------------------------------------------

            horariosUnicos.sort(
                (a, b) =>
                    converterParaMinutos(a.inicio) -
                    converterParaMinutos(b.inicio)
            );


            res.json(horariosUnicos);


        } catch (error) {

            console.error(
                "Erro ao buscar horários:",
                error
            );

            res.status(500).json({

                sucesso: false,

                erro:
                    "Erro ao buscar horários."

            });

        }

    }
);


// =========================================================
// REALIZAR AGENDAMENTO
// =========================================================

app.post("/agendamentos", async (req, res) => {

    try {

        const {
            profissional_id,
            data_consulta,
            hora_inicio,
            hora_fim,
            nome_responsavel,
            whatsapp_responsavel,
            email_responsavel,
            nome_crianca,
            observacoes
        } = req.body;


        // -------------------------------------------------
        // VALIDAÇÕES
        // -------------------------------------------------

        if (
            !profissional_id ||
            !data_consulta ||
            !hora_inicio ||
            !hora_fim ||
            !nome_responsavel ||
            !whatsapp_responsavel ||
            !nome_crianca
        ) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Preencha todos os campos obrigatórios."

            });

        }


        if (!validarData(data_consulta)) {

            return res.status(400).json({

                sucesso: false,

                erro: "Data inválida."

            });

        }


        // -------------------------------------------------
        // VERIFICAR PROFISSIONAL
        // -------------------------------------------------

        const [profissional] =
            await db.query(`

                SELECT
                    id,
                    nome,
                    ativo,
                    agenda_disponivel

                FROM profissionais

                WHERE id = ?

                LIMIT 1

            `, [
                Number(profissional_id)
            ]);


        if (profissional.length === 0) {

            return res.status(404).json({

                sucesso: false,

                erro:
                    "Profissional não encontrado."

            });

        }


        if (!profissional[0].ativo) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Este profissional está inativo."

            });

        }


        if (!profissional[0].agenda_disponivel) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "A agenda deste profissional está indisponível."

            });

        }


        // -------------------------------------------------
        // VERIFICAR SE O HORÁRIO JÁ ESTÁ OCUPADO
        // -------------------------------------------------

        const [conflitos] =
            await db.query(`

                SELECT
                    id

                FROM agendamentos

                WHERE profissional_id = ?
                  AND data_consulta = ?
                  AND status <> 'cancelado'

                  AND hora_inicio < ?
                  AND hora_fim > ?

                LIMIT 1

            `, [

                Number(profissional_id),

                data_consulta,

                hora_fim,

                hora_inicio

            ]);


        if (conflitos.length > 0) {

            return res.status(409).json({

                sucesso: false,

                erro:
                    "Este horário acabou de ser ocupado. Escolha outro horário."

            });

        }


        // -------------------------------------------------
        // INSERIR AGENDAMENTO
        // -------------------------------------------------

        const [resultado] =
            await db.query(`

                INSERT INTO agendamentos (

                    profissional_id,
                    data_consulta,
                    hora_inicio,
                    hora_fim,
                    nome_responsavel,
                    whatsapp_responsavel,
                    email_responsavel,
                    nome_crianca,
                    observacoes,
                    status

                )

                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'agendado')

            `, [

                Number(profissional_id),

                data_consulta,

                hora_inicio,

                hora_fim,

                nome_responsavel,

                whatsapp_responsavel,

                email_responsavel || null,

                nome_crianca,

                observacoes || null

            ]);


        res.status(201).json({

            sucesso: true,

            mensagem:
                "Agendamento realizado com sucesso!",

            id:
                resultado.insertId

        });


    } catch (error) {

        console.error(
            "Erro ao realizar agendamento:",
            error
        );


        res.status(500).json({

            sucesso: false,

            erro:
                "Erro ao realizar agendamento."

        });

    }

});


// =========================================================
// FUNÇÃO: VALIDAR DATA
// =========================================================

function validarData(data) {

    if (
        typeof data !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data)
    ) {

        return false;

    }


    const [ano, mes, dia] =
        data.split("-").map(Number);


    const dataObj =
        new Date(
            ano,
            mes - 1,
            dia
        );


    return (
        dataObj.getFullYear() === ano &&
        dataObj.getMonth() === mes - 1 &&
        dataObj.getDate() === dia
    );

}


// =========================================================
// FUNÇÃO: DIA DA SEMANA
// =========================================================

function obterDiaSemana(data) {

    const [ano, mes, dia] =
        data.split("-").map(Number);


    const dataObj =
        new Date(
            ano,
            mes - 1,
            dia
        );


    return dataObj.getDay();

}


// =========================================================
// FUNÇÃO: HH:MM → MINUTOS
// =========================================================

function converterParaMinutos(hora) {

    if (!hora) return 0;


    const partes =
        String(hora)
            .substring(0, 5)
            .split(":");


    const horas =
        Number(partes[0]);


    const minutos =
        Number(partes[1]);


    return (
        horas * 60 +
        minutos
    );

}


// =========================================================
// FUNÇÃO: MINUTOS → HH:MM
// =========================================================

function minutosParaHora(minutos) {

    const horas =
        Math.floor(minutos / 60);


    const mins =
        minutos % 60;


    return (
        String(horas).padStart(2, "0") +
        ":" +
        String(mins).padStart(2, "0")
    );

}


// =========================================================
// TRATAMENTO DE ERROS DO EXPRESS
// =========================================================

app.use((req, res) => {

    res.status(404).json({

        sucesso: false,

        erro:
            "Rota não encontrada."

    });

});


// =========================================================
// INICIAR SERVIDOR
// =========================================================

async function iniciarServidor() {

    await testarBanco();


    app.listen(
        PORT,
        () => {

            console.log("");
            console.log(
                "========================================"
            );

            console.log(
                " Tenda do Cuidar - API"
            );

            console.log(
                "========================================"
            );

            console.log(
                `API funcionando em http://localhost:${PORT}`
            );

            console.log(
                "========================================"
            );

        }
    );

}


iniciarServidor();
