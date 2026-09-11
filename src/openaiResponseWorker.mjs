import fs from 'node:fs';

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

async function main() {
  const request = JSON.parse(readStdin());
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Set it before using --adapter openai.');
  }
  const body = {
    model: request.model,
    input: [
      {
        role: 'system',
        content: request.system
      },
      {
        role: 'user',
        content: request.user
      }
    ],
    reasoning: {
      effort: request.reasoningEffort || 'medium'
    }
  };
  if (request.textFormat === 'json') {
    body.text = { format: { type: 'json_object' } };
  }
  if (request.temperature !== undefined && request.temperature !== null) {
    body.temperature = request.temperature;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || response.statusText;
    throw new Error(`OpenAI Responses API error ${response.status}: ${message}`);
  }
  const text = extractOutputText(payload);
  if (!text) throw new Error('OpenAI response did not contain output text.');
  process.stdout.write(JSON.stringify({ text, responseId: payload.id || null, usage: payload.usage || null }, null, 2));
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') chunks.push(content.text);
      if (content.type === 'text' && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
