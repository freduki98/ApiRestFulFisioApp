const express = require('express');
const cors = require('cors');
const { Client } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// CREDENCIALES BASE DE DATOS
const azureHost = process.env.HOST_AZURE;
const dbUser = process.env.USER_DB;
const dbPassword = process.env.PASSWORD_DB;
const dbName = process.env.NAME_DB;

// // CREDENCIALES FIREBASE
const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
});

app.use(cors());
app.use(express.json());

// INICIALIZACION CLIENTE BASE DE DATOS
const client = new Client({
    host: azureHost,
    port: 5432,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    ssl: {
        rejectUnauthorized: false
    }
});

// VERIFICACIÓN USUARIO VÁLIDO
async function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('No autorizado');
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error al verificar token:', error);
        res.status(401).send('Token inválido');
    }
}


// CONEXIÓN CON BASE DE DATOS
client.connect()
    .then(() => console.log('Conectado a la base de datos PostgreSQL'))
    .catch(err => console.error('Error al conectar a PostgreSQL', err.stack));

// Obtener todos los pacientes de un fisioterapeuta
app.get('/pacientes', checkAuth, async (req, res) => {
    const { fisio_id } = req.query;
    try {
        const result = await client.query(
            'SELECT * FROM paciente_fisio WHERE fisio_id = $1',
            [fisio_id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error al obtener los pacientes');
    }
});

// Buscar paciente por nombre y fisioterapeuta
app.get('/paciente', checkAuth, async (req, res) => {
    const { nombre, fisio_id } = req.query;
    try {
        const result = await client.query(
            `SELECT * FROM paciente_fisio
             WHERE CONCAT(nombre, ' ', apellidos) ~* $1 AND fisio_id = $2`,
            [nombre, fisio_id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error al buscar el paciente');
    }
});

// Insertar nuevo paciente
app.post('/new_paciente', checkAuth, async (req, res) => {
    const { paciente_id, nombre, apellidos, direccion, telefono, fecha_nacimiento, fisio_id } = req.body;
    try {
        await client.query(
            `INSERT INTO paciente_fisio (paciente_id, nombre, apellidos, direccion, telefono, fecha_nacimiento, fisio_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [paciente_id, nombre, apellidos, direccion, telefono, fecha_nacimiento, fisio_id]
        );
        res.sendStatus(200);
    } catch (error) {
        console.error('Error al insertar paciente:', error);
        res.sendStatus(500);
    }
});

// Editar paciente
app.put('/edit_paciente', checkAuth, async (req, res) => {
    const { paciente_id, nombre, apellidos, direccion, telefono, fecha_nacimiento, fisio_id } = req.body;
    try {
        await client.query(
            `UPDATE paciente_fisio
             SET nombre=$3, apellidos=$4, direccion=$5, telefono=$6, fecha_nacimiento=$7
             WHERE paciente_id=$1 AND fisio_id=$2`,
            [paciente_id, fisio_id, nombre, apellidos, direccion, telefono, fecha_nacimiento]
        );
        res.sendStatus(200);
    } catch (error) {
        console.error('Error al editar paciente:', error);
        res.sendStatus(500);
    }
});

// Eliminar paciente
app.delete('/delete_paciente', checkAuth, async (req, res) => {
    const { paciente_id, fisio_id } = req.query;
    try {
        await client.query(
            'DELETE FROM paciente_fisio WHERE paciente_id = $1 AND fisio_id = $2',
            [paciente_id, fisio_id]
        );
        res.sendStatus(200);
    } catch (error) {
        console.error('Error al eliminar paciente:', error);
        res.sendStatus(500);
    }
});

// Obtener diagnósticos de un paciente
app.get('/historialPaciente', checkAuth, async (req, res) => {
    const { paciente_id, fisio_id } = req.query;

    try {
        const result = await client.query(
            'SELECT d.id, d.sistema_lesionado, d.zona_afectada ' +
            'FROM diagnostico_medico d, paciente_historial_medico hm ' +
            'WHERE d.id = hm.diagnostico_id AND hm.paciente_id = $1 AND hm.fisio_id = $2',
            [paciente_id, fisio_id]
        );

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al obtener diagnósticos:', error);
        res.sendStatus(500);
    }
});

// Obtener diagnósticos disponibles
app.get('/diagnosticosDisponibles', checkAuth, async (req, res) => {
    const { } = req.query;

    try {
        const result = await client.query(
            'SELECT id, sistema_lesionado, zona_afectada ' +
            'FROM diagnostico_medico',
            []
        );

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al obtener diagnósticos:', error);
        res.sendStatus(500);
    }
});

// Obtener diagnósticos por ID
app.get('/diagnosticoById', checkAuth, async (req, res) => {
    const { id } = req.query;

    try {
        const result = await client.query(
            'SELECT id, sistema_lesionado, zona_afectada ' +
            'FROM diagnostico_medico WHERE id  ~* $1 ',
            [id]
        );

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al obtener el diagnóstico buscado:', error);
        res.sendStatus(500);
    }
});

// Obtener diagnóstico del paciente
app.get('/diagnostico_paciente', checkAuth, async (req, res) => {
    const { paciente_id, fisio_id, diagnostico_id } = req.query;

    try {
        const result = await client.query(
            'SELECT diagnostico_id, fecha_diagnostico, fecha_inicio_tratamiento, fecha_fin_tratamiento, sintomas, medicamentos ' +
            'FROM paciente_historial_medico WHERE diagnostico_id = $1 AND fisio_id = $2 AND paciente_id = $3 ',
            [diagnostico_id, fisio_id, paciente_id]
        );

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error al obtener el diagnóstico del paciente:', error);
        res.sendStatus(500);
    }
});

app.post('/new_diagnostico_paciente', checkAuth, async (req, res) => {
    const {
        paciente_id,
        fisio_id,
        diagnostico_id,
        fecha_diagnostico,
        fecha_inicio_tratamiento,
        fecha_fin_tratamiento,
        sintomas,
        medicamentos
    } = req.body;

    try {
        const result = await client.query(
            'INSERT INTO paciente_historial_medico (paciente_id, fisio_id, diagnostico_id, fecha_diagnostico, fecha_inicio_tratamiento, fecha_fin_tratamiento, sintomas, medicamentos) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [paciente_id, fisio_id, diagnostico_id, fecha_diagnostico, fecha_inicio_tratamiento, fecha_fin_tratamiento, sintomas, medicamentos]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error al insertar diagnóstico del paciente:', error);
        res.sendStatus(500);
    }
});

app.put('/edit_diagnostico_paciente', checkAuth, async (req, res) => {
    const {
        paciente_id,
        fisio_id,
        diagnostico_id,
        fecha_diagnostico,
        fecha_inicio_tratamiento,
        fecha_fin_tratamiento,
        sintomas,
        medicamentos
    } = req.body;

    try {
        const result = await client.query(
            'UPDATE paciente_historial_medico SET fecha_diagnostico = $4, fecha_inicio_tratamiento = $5, fecha_fin_tratamiento = $6, sintomas = $7, medicamentos = $8 ' +
            'WHERE diagnostico_id = $3 AND fisio_id = $2 AND paciente_id = $1 RETURNING *',
            [paciente_id, fisio_id, diagnostico_id, fecha_diagnostico, fecha_inicio_tratamiento, fecha_fin_tratamiento, sintomas, medicamentos]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Diagnóstico no encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error al actualizar el diagnóstico del paciente:', error);
        res.sendStatus(500);
    }
});

app.delete('/delete_diagnostico_paciente', checkAuth, async (req, res) => {
    const { paciente_id, fisio_id, diagnostico_id } = req.query;
    try {
        await client.query(
            'DELETE FROM paciente_historial_medico WHERE paciente_id =$1 AND fisio_id =$2 AND diagnostico_id =$3',
            [paciente_id, fisio_id, diagnostico_id]
        );
        res.sendStatus(200);
    } catch (error) {
        console.error('Error al eliminar el diagnostico:', error);
        res.sendStatus(500);
    }
});

// Obtener último diagnóstico del paciente
app.get('/ultimo_diagnostico_paciente', checkAuth, async (req, res) => {
    const { paciente_id, fisio_id } = req.query;

    try {
        const result = await client.query(
            `SELECT dm.id, dm.sistema_lesionado, dm.zona_afectada 
             FROM diagnostico_medico dm
             JOIN paciente_historial_medico ph ON ph.diagnostico_id = dm.id
             WHERE ph.paciente_id = $1 AND ph.fisio_id = $2
             ORDER BY ph.fecha_diagnostico DESC 
             LIMIT 1`,
            [paciente_id, fisio_id]
        );

        res.status(200).json(result.rows[0] || {});
    } catch (error) {
        console.error('Error al obtener el último diagnóstico del paciente:', error);
        res.sendStatus(500);
    }
});


app.listen(port, () => {
    console.log(`Servidor escuchando en puerto: ${port}`);
});

