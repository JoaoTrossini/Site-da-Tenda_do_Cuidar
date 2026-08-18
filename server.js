const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));

// ======================================================
// CONEXÃO COM O MYSQL
// ======================================================

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


// ======================================================
// TESTE DA API
// ======================================================

app.get("/", (req, res) => {

    res.json({
        mensagem: "API da Tenda do Cuidar funcionando!"
    });

});


// ======================================================
// BUSCAR PROFISSIONAIS
// ======================================================

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

        console.error("Erro ao buscar profissionais:", error);

        res.status(500).json({
            erro: "Erro ao buscar profissionais"
        });

    }

});


// ======================================================
// BUSCAR DISPONIBILIDADE SEMANAL
// ======================================================

app.get("/disponibilidades/:profissionalId", async (req, res) => {

    try {

        const profissionalId = req.params.profissionalId;

        const [rows] = await db.query(`
            SELECT
                id,
                profissional_id,
                dia_semana,
                hora_inicio,
                hora_fim,
                duracao_minutos
            FROM disponibilidades
            WHERE profissional_id = ?
              AND ativo = TRUE
            ORDER BY dia_semana, hora_inicio
        `, [profissionalId]);

        res.json(rows);

    } catch (error) {

        console.error(
            "Erro ao buscar disponibilidades:",
            error
        );

        res.status(500).json({
            erro: "Erro ao buscar disponibilidades"
        });

    }

});


// ======================================================
// GERAR HORÁRIOS PARA UMA DATA
// ======================================================

app.get("/horarios/:profissionalId/:data", async (req, res) => {

    try {

        const profissionalId =
            req.params.profissionalId;

        const data =
            req.params.data;


        // --------------------------------------------------
        // Descobrir o dia da semana
        // --------------------------------------------------

        const dataObj = new Date(data + "T00:00:00");

        let diaSemana = dataObj.getDay();

        // JavaScript:
        // 0 = domingo
        // 1 = segunda
        // 2 = terça
        // 3 = quarta
        // 4 = quinta
        // 5 = sexta
        // 6 = sábado


        // --------------------------------------------------
        // Buscar a configuração daquele dia
        // --------------------------------------------------

        const [disponibilidades] = await db.query(`
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


        // Se não atende nesse dia
        if (disponibilidades.length === 0) {

            return res.json([]);

        }


        // --------------------------------------------------
        // Buscar agendamentos já existentes
        // --------------------------------------------------

        const [agendamentos] = await db.query(`
            SELECT
                hora_inicio,
                hora_fim
            FROM agendamentos
            WHERE profissional_id = ?
              AND data_consulta = ?
              AND status IN ('reservado', 'confirmado')
        `, [
            profissionalId,
            data
        ]);


        // --------------------------------------------------
        // Criar horários
        // --------------------------------------------------

        const horarios = [];


        disponibilidades.forEach(disponibilidade => {

            let inicio =
                converterParaMinutos(
                    disponibilidade.hora_inicio
                );

            const fim =
                converterParaMinutos(
                    disponibilidade.hora_fim
                );

            const duracao =
                disponibilidade.duracao_minutos;


            while (inicio + duracao <= fim) {

                const horarioInicio =
                    minutosParaHora(inicio);

                const horarioFim =
                    minutosParaHora(
                        inicio + duracao
                    );


                // --------------------------------------------------
                // Verificar se já está ocupado
                // --------------------------------------------------

                const ocupado =
                    agendamentos.some(agendamento => {

                        const agendamentoInicio =
                            converterParaMinutos(
                                agendamento.hora_inicio
                            );

                        const agendamentoFim =
                            converterParaMinutos(
                                agendamento.hora_fim
                            );


                        return (
                            inicio < agendamentoFim &&
                            inicio + duracao > agendamentoInicio
                        );

                    });


                horarios.push({

                    inicio: horarioInicio,

                    fim: horarioFim,

                    disponivel: !ocupado

                });


                inicio += duracao;

            }

        });


        res.json(horarios);


    } catch (error) {

        console.error(
            "Erro ao gerar horários:",
            error
        );

        res.status(500).json({

            erro: "Erro ao buscar horários"

        });

    }

});


// ======================================================
// CRIAR AGENDAMENTO
// ======================================================

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


        // --------------------------------------------------
        // Validação
        // --------------------------------------------------

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

                erro:
                    "Preencha todos os campos obrigatórios."

            });

        }


        // --------------------------------------------------
        // Verificar se o horário já foi ocupado
        // --------------------------------------------------

        const [existente] = await db.query(`
            SELECT id
            FROM agendamentos
            WHERE profissional_id = ?
              AND data_consulta = ?
              AND hora_inicio = ?
              AND status IN ('reservado', 'confirmado')
            LIMIT 1
        `, [

            profissional_id,
            data_consulta,
            hora_inicio

        ]);


        if (existente.length > 0) {

            return res.status(409).json({

                erro:
                    "Este horário acabou de ser reservado por outra pessoa."

            });

        }


        // --------------------------------------------------
        // Criar agendamento
        // --------------------------------------------------

        const [resultado] = await db.query(`

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

            profissional_id,
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

            id: resultado.insertId

        });


    } catch (error) {

        console.error(
            "Erro ao realizar agendamento:",
            error
        );

        res.status(500).json({

            erro:
                "Erro ao realizar agendamento."

        });

    }

});


// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

function converterParaMinutos(hora) {

    const partes =
        String(hora)
            .substring(0, 5)
            .split(":");

    return (
        parseInt(partes[0], 10) * 60 +
        parseInt(partes[1], 10)
    );

}


function minutosParaHora(minutos) {

    const horas =
        Math.floor(minutos / 60);

    const minutosRestantes =
        minutos % 60;


    return (

        String(horas).padStart(2, "0") +
        ":" +
        String(minutosRestantes).padStart(2, "0")

    );

}


// ======================================================
// INICIAR SERVIDOR
// ======================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `API funcionando em http://localhost:${PORT}`
    );

});
