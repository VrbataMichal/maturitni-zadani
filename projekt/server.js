const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Servíruj statické soubory ze složky public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback na index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});
