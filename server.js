require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// =========================================================
// CONFIGURAÃ‡Ã•ES
// =========================================================

const PORT = 3000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

app.post("/admin/login", (req, res) => {
    const { email, password } = req.body;

    if (
        !email ||
        !password ||
        email !== ADMIN_EMAIL ||
        password !== ADMIN_PASSWORD
    ) {
        return res.status(401).json({
            erro: "E-mail ou senha invÃ¡lidos."
        });
    }

    const token = jwt.sign(
        {
            tipo: "admin",
            email: ADMIN_EMAIL
        },
        JWT_SECRET,
        {
            expiresIn: "8h"
        }
    );

    res.json({
        sucesso: true,
        token
    });
});

function autenticarAdmin(req, res, next) {
    const cabecalho = req.headers.authorization;

    if (!cabecalho || !cabecalho.startsWith("Bearer ")) {
        return res.status(401).json({
            erro: "Token não informado."
        });
    }

    const token = cabecalho.substring(7);

    try {
        const dados = jwt.verify(token, JWT_SECRET);

        if (dados.tipo !== "admin") {
            return res.status(403).json({
                erro: "Acesso negado."
            });
        }

        req.admin = dados;
        next();

    } catch (error) {
        return res.status(401).json({
            erro: "Token inválido ou expirado."
        });
    }
}

app.get(
    "/admin/agendamentos",
    autenticarAdmin,
    async (req, res) => {

        try {

            const [agendamentos] = await db.query(`
                SELECT
                    a.id,
                    DATE_FORMAT(a.data_consulta, '%Y-%m-%d') AS data_consulta,
                    TIME_FORMAT(a.hora_inicio, '%H:%i') AS hora_inicio,
                    TIME_FORMAT(a.hora_fim, '%H:%i') AS hora_fim,
                    a.nome_responsavel,
                    a.whatsapp_responsavel,
                    a.email_responsavel,
                    a.nome_crianca,
                    a.status,
                    p.nome AS profissional
                FROM agendamentos a
                INNER JOIN profissionais p
                    ON p.id = a.profissional_id
                ORDER BY
                    a.data_consulta ASC,
                    a.hora_inicio ASC
            `);

            res.json({
                agendamentos
            });

        } catch (error) {

            console.error(
                "Erro ao carregar agendamentos:",
                error
            );

            res.status(500).json({
                erro: "Erro ao carregar a agenda."
            });
        }
    }
);

// =========================================================
// CONEXÃƒO COM MYSQL
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
// TESTAR CONEXÃƒO COM BANCO
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
    res.sendFile(path.join(__dirname, "index.html"));
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
                erro: "ID do profissional invÃ¡lido."
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
                erro: "Profissional nÃ£o encontrado."
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
                erro: "ID do profissional invÃ¡lido."
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
// HORÃRIOS DE UMA DATA ESPECÃFICA
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
                    erro: "Profissional invÃ¡lido."
                });

            }


            // -------------------------------------------------
            // VALIDAR DATA
            // -------------------------------------------------

            if (!validarData(data)) {

                return res.status(400).json({
                    sucesso: false,
                    erro: "Data invÃ¡lida. Use o formato YYYY-MM-DD."
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
                    erro: "Profissional nÃ£o encontrado."
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
            // TerÃ§a = 2
            // Quarta = 3
            // Quinta = 4
            // Sexta = 5
            // SÃ¡bado = 6

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
            // GERAR HORÃRIOS
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

                                    // Cancelado nÃ£o ocupa horÃ¡rio
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
            // ORDENAR HORÃRIOS
            // -------------------------------------------------

            horariosUnicos.sort(
                (a, b) =>
                    converterParaMinutos(a.inicio) -
                    converterParaMinutos(b.inicio)
            );


            res.json(horariosUnicos);


        } catch (error) {

            console.error(
                "Erro ao buscar horÃ¡rios:",
                error
            );

            res.status(500).json({

                sucesso: false,

                erro:
                    "Erro ao buscar horÃ¡rios."

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
        // VALIDAÃ‡Ã•ES
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
                    "Preencha todos os campos obrigatÃ³rios."

            });

        }


        if (!validarData(data_consulta)) {

            return res.status(400).json({

                sucesso: false,

                erro: "Data invÃ¡lida."

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
                    "Profissional nÃ£o encontrado."

            });

        }


        if (!profissional[0].ativo) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Este profissional estÃ¡ inativo."

            });

        }


        if (!profissional[0].agenda_disponivel) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "A agenda deste profissional estÃ¡ indisponÃ­vel."

            });

        }


        // -------------------------------------------------
        // VERIFICAR SE O HORÃRIO JÃ ESTÃ OCUPADO
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
                    "Este horÃ¡rio acabou de ser ocupado. Escolha outro horÃ¡rio."

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

                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reservado')

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
// FUNÃ‡ÃƒO: VALIDAR DATA
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
// FUNÃ‡ÃƒO: DIA DA SEMANA
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
// FUNÃ‡ÃƒO: HH:MM â†’ MINUTOS
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
// FUNÃ‡ÃƒO: MINUTOS â†’ HH:MM
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
            "Rota nÃ£o encontrada."

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

