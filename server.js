require('dotenv').config();
if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY is not set. Add it to your .env file.');
  process.exit(1);
}

const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/departments', require('./routes/departments'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/copilot', require('./routes/copilot'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/promotion', require('./routes/promotion'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/reset', require('./routes/reset'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Jisr AI running on http://localhost:${PORT}`));
