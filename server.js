// server.js — API para estatísticas de jogadores
// =====================================================================

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURAÇÃO DO BANCO DE DADOS (MySQL)
// ============================================================
// Substitua com suas credenciais
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'sua_senha',
  database: 'minecraft_stats',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;

async function initDB() {
  pool = mysql.createPool(dbConfig);
  // Cria a tabela se não existir
  const connection = await pool.getConnection();
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS player_stats (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      kills INT DEFAULT 0,
      deaths INT DEFAULT 0,
      blocks_broken INT DEFAULT 0,
      playtime_seconds INT DEFAULT 0,
      distance_from_base INT DEFAULT 0,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      online BOOLEAN DEFAULT FALSE,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  connection.release();
  console.log('✅ Banco de dados conectado e tabela criada.');
}

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({
  origin: '*', // Em produção, restrinja ao seu domínio
  methods: ['GET']
}));
app.use(express.json());

// ============================================================
// ENDPOINTS
// ============================================================

// Endpoint para buscar dados de um jogador específico
app.get('/api/player/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT 
        username,
        kills,
        deaths,
        IF(deaths = 0, kills, ROUND(kills / deaths, 2)) AS kdr,
        blocks_broken,
        playtime_seconds,
        distance_from_base,
        online,
        last_seen
      FROM player_stats
      WHERE LOWER(username) = LOWER(?)`,
      [username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Jogador não encontrado' });
    }

    const player = rows[0];
    // Formata tempo de jogo
    const playtime_hours = Math.floor(player.playtime_seconds / 3600);
    const playtime_minutes = Math.floor((player.playtime_seconds % 3600) / 60);

    res.json({
      username: player.username,
      online: player.online === 1,
      kills: player.kills,
      deaths: player.deaths,
      kdr: parseFloat(player.kdr) || 0,
      blocks_broken: player.blocks_broken,
      playtime_hours: playtime_hours,
      playtime_minutes: playtime_minutes,
      distance_from_base: player.distance_from_base,
      last_seen: player.last_seen
    });
  } catch (error) {
    console.error('Erro ao buscar jogador:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Endpoint para listar todos os jogadores (ordenados por kills)
app.get('/api/players', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT username, kills, deaths, online, last_seen 
       FROM player_stats 
       ORDER BY kills DESC 
       LIMIT 50`
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar jogadores:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Endpoint para status do servidor (combina com a API externa)
app.get('/api/status', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as total, SUM(online) as online FROM player_stats`
    );
    res.json({
      online: rows[0].online || 0,
      total: rows[0].total || 0,
      uptime: process.uptime()
    });
  } catch (error) {
    res.json({ online: 0, total: 0, uptime: 0 });
  }
});

// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function startServer() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
      console.log(`📊 Endpoints disponíveis:`);
      console.log(`  GET /api/player/:username`);
      console.log(`  GET /api/players`);
      console.log(`  GET /api/status`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();