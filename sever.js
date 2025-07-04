const express = require('express');
const path = require('path');
const app = express();
const PORT = 8000;

app.use(express.static(path.join(__dirname, 'src')));

app.listen(PORT, () => {
  console.log(` http://localhost:${PORT}`);
});
