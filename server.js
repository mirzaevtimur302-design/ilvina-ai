// Серверная часть Ильвины. API-ключ хранится только в переменной окружения GEMINI_API_KEY.
const express = require('express');
const path = require('path');
const app = express();
app.use(express.json({limit:'1mb'}));
app.use(express.static(path.join(__dirname, 'public')));

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

app.get('/api/health', (_req, res) => res.json({ok:true, configured:!!API_KEY}));
app.post('/api/chat', async (req, res) => {
  try {
    if (!API_KEY) return res.status(503).json({error:'Сервер не настроен: добавьте GEMINI_API_KEY в переменные окружения.'});
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({error:'Сообщение пустое.'});
    const prior = Array.isArray(req.body.history) ? req.body.history.slice(-20) : [];
    const contents = [];
    for (const item of prior) {
      if (!item || typeof item.text !== 'string') continue;
      const role = item.role === 'assistant' ? 'model' : 'user';
      // Ignore malformed role sequences; Gemini expects user/model turns.
      if (!['user','model'].includes(role)) continue;
      contents.push({role, parts:[{text:item.text.slice(0,8000)}]});
    }
    // Ensure history ends on a model turn before appending the new user message.
    while (contents.length && contents[contents.length-1].role === 'user') contents.pop();
    contents.push({role:'user',parts:[{text:message.slice(0,8000)}]});
    const systemInstruction = {
      parts:[{text:
        'Тебя зовут Ильвина. Ты дружелюбный, внимательный ИИ-помощник, общаешься естественно и неформально на русском языке. '+
        'Помогай с повседневными вопросами, дружбой, знакомствами, симпатией и отношениями. Будь бережной к чувствам, не осуждай, давай конкретные советы, уважай границы людей и не обещай гарантированный успех. '+
        'Можешь шутить, но не притворяйся человеком и честно говори, если чего-то не знаешь. Не повторяй одну и ту же заготовленную фразу.'}]
    };
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({systemInstruction,contents,generationConfig:{temperature:0.85,maxOutputTokens:1200}})
    });
    const data = await upstream.json().catch(()=>({}));
    if (!upstream.ok) {
      const msg = data?.error?.message || `ИИ-провайдер вернул HTTP ${upstream.status}`;
      return res.status(502).json({error:msg});
    }
    const reply = (data.candidates?.[0]?.content?.parts || []).map(p=>p.text || '').join('').trim();
    if (!reply) return res.status(502).json({error:'ИИ не вернул текстовый ответ. Попробуйте ещё раз.'});
    res.json({reply});
  } catch (err) {
    console.error('chat error:', err.message);
    res.status(500).json({error:'Внутренняя ошибка сервера. Проверьте настройки и журнал сервера.'});
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Ilvina server listening on ${port}`));
