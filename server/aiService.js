// server/aiService.js — Server-side AI Provider Interface
// Supports Google Gemini (free tier), Anthropic Claude, and OpenAI
// NEVER returns fake generated results when credentials are missing.

require('dotenv').config();

function getAIStatus() {
  const gemini = !!process.env.GEMINI_API_KEY;
  const anthropic = !!process.env.ANTHROPIC_API_KEY;
  const openai = !!process.env.OPENAI_API_KEY;

  const configured = gemini || anthropic || openai;
  let activeProvider = null;
  if (gemini) activeProvider = 'gemini';
  else if (anthropic) activeProvider = 'anthropic';
  else if (openai) activeProvider = 'openai';

  return {
    configured,
    activeProvider,
    providers: {
      gemini,
      anthropic,
      openai
    }
  };
}

const SYSTEM_GENERATION_PROMPT = `You are BuildAI, an expert full-stack engineer and UI designer.
Your job is to generate real, production-ready, beautiful web application source code based on user prompts.

RULES FOR FILE GENERATION:
1. Always output complete, working, maintainable source code.
2. Structure your application into multiple clean files (e.g. index.html, styles.css, app.js).
3. In index.html, include Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>) and FontAwesome CDN (<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"/>) for modern UI.
4. Link styles.css via <link rel="stylesheet" href="styles.css"/> and app.js via <script src="app.js"></script>.
5. FORMAT: Use exact file delimiter blocks so the server parser can extract each file:

===FILE: index.html===
<!DOCTYPE html>
<html lang="en">
...
</html>
===END_FILE===

===FILE: styles.css===
/* Custom styles */
===END_FILE===

===FILE: app.js===
// Interactive client logic
===END_FILE===

Do not truncate code. Write fully functional, clean, interactive logic.`;

const SYSTEM_EDIT_PROMPT = `You are BuildAI, updating an existing web application project based on user chat instructions.
You will be provided with the current project files and the user's change request.
Only output the files that need to be created or modified using the delimiter format:

===FILE: filename.ext===
...updated complete content...
===END_FILE===

Preserve existing functionality while cleanly implementing the requested update.`;

const SYSTEM_DEBUG_PROMPT = `You are BuildAI Repair Agent, an expert debugging and auto-repair system for web applications.
You will be provided with:
1. Error diagnostics, compiler failure output, or unhandled runtime exceptions.
2. The current project source files.

YOUR TASK:
1. Carefully diagnose the root cause of the error.
2. Propose a minimal, targeted, non-destructive fix that resolves the issue without breaking existing features.
3. Structure your response using these exact delimiters:

===DIAGNOSIS===
Concise description of the bug and why it occurred.
===ROOT_CAUSE===
File name and problematic line/construct.
===REASONING===
Explanation of how the proposed change fixes the issue safely.
===FILES===
===FILE: target_file_path===
...complete updated content of the fixed file...
===END_FILE===

Only include files that require modification or creation. Preserve all existing working functionality.`;

// Parse file blocks from streaming or completed LLM response
function parseFileBlocks(text) {
  const files = [];
  const fileRegex = /===FILE:\s*([^\n\r=]+)===\r?\n([\s\S]*?)(?:===END_FILE===|$)/gi;
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    const rawPath = match[1].trim();
    let content = match[2];
    
    // If the block is followed by another ===FILE:, trim content before next block
    const nextFileIdx = content.indexOf('===FILE:');
    if (nextFileIdx !== -1) {
      content = content.substring(0, nextFileIdx);
    }

    // Clean markdown code fence if wrapped
    content = content.replace(/^```[a-z]*\r?\n/i, '').replace(/\r?\n```$/g, '').trim();

    if (rawPath && content) {
      files.push({
        path: rawPath,
        content
      });
    }
  }

  // Fallback: If model output raw single HTML without delimiters, save as index.html
  if (files.length === 0 && text.includes('<html')) {
    let clean = text.trim();
    const start = clean.indexOf('<!DOCTYPE') !== -1 ? clean.indexOf('<!DOCTYPE') : clean.indexOf('<html');
    if (start !== -1) clean = clean.substring(start);
    const end = clean.lastIndexOf('</html>');
    if (end !== -1) clean = clean.substring(0, end + 7);
    files.push({ path: 'index.html', content: clean });
  }

  return files;
}

// Generate new project files from prompt
async function generateFiles({ prompt, onToken }) {
  const status = getAIStatus();
  if (!status.configured) {
    throw new Error(
      'AI_NOT_CONFIGURED: No AI API key is configured on the server. ' +
      'Please add GEMINI_API_KEY (recommended free tier from https://aistudio.google.com), ' +
      'ANTHROPIC_API_KEY, or OPENAI_API_KEY to your .env file.'
    );
  }

  let fullResponse = '';

  if (status.activeProvider === 'gemini') {
    fullResponse = await callGeminiStream({
      systemInstruction: SYSTEM_GENERATION_PROMPT,
      userMessage: `Create a complete web application for this idea:\n\n${prompt}`,
      onToken
    });
  } else if (status.activeProvider === 'openai') {
    fullResponse = await callOpenAIStream({
      systemInstruction: SYSTEM_GENERATION_PROMPT,
      userMessage: `Create a complete web application for this idea:\n\n${prompt}`,
      onToken
    });
  } else if (status.activeProvider === 'anthropic') {
    fullResponse = await callAnthropicStream({
      systemInstruction: SYSTEM_GENERATION_PROMPT,
      userMessage: `Create a complete web application for this idea:\n\n${prompt}`,
      onToken
    });
  }

  const files = parseFileBlocks(fullResponse);
  if (files.length === 0) {
    throw new Error('AI returned a response, but no valid source files could be extracted. Please try again.');
  }

  return { files, fullResponse };
}

// Edit existing project files through chat
async function editFiles({ instruction, currentFiles, chatHistory = [], onToken }) {
  const status = getAIStatus();
  if (!status.configured) {
    throw new Error(
      'AI_NOT_CONFIGURED: No AI API key is configured on the server. ' +
      'Please configure GEMINI_API_KEY in your .env file to enable chat editing.'
    );
  }

  const fileContext = currentFiles.map(f => `===FILE: ${f.path}===\n${f.content}\n===END_FILE===`).join('\n\n');
  const userMessage = `CURRENT PROJECT FILES:\n${fileContext}\n\nUSER INSTRUCTION:\n${instruction}`;

  let fullResponse = '';

  if (status.activeProvider === 'gemini') {
    fullResponse = await callGeminiStream({
      systemInstruction: SYSTEM_EDIT_PROMPT,
      userMessage,
      onToken
    });
  } else if (status.activeProvider === 'openai') {
    fullResponse = await callOpenAIStream({
      systemInstruction: SYSTEM_EDIT_PROMPT,
      userMessage,
      onToken
    });
  } else if (status.activeProvider === 'anthropic') {
    fullResponse = await callAnthropicStream({
      systemInstruction: SYSTEM_EDIT_PROMPT,
      userMessage,
      onToken
    });
  }

  const updatedFiles = parseFileBlocks(fullResponse);
  return { updatedFiles, fullResponse };
}

function parseDiagnosisResponse(rawText) {
  let diagnosis = 'Automated diagnosis completed.';
  let rootCause = 'Runtime or build defect.';
  let reasoning = 'Minimal targeted correction.';

  const diagMatch = /===DIAGNOSIS===([\s\S]*?)(?:===ROOT_CAUSE===|===REASONING===|===FILES===|===FILE:|$)/i.exec(rawText);
  if (diagMatch && diagMatch[1].trim()) {
    diagnosis = diagMatch[1].trim();
  }

  const causeMatch = /===ROOT_CAUSE===([\s\S]*?)(?:===REASONING===|===FILES===|===FILE:|$)/i.exec(rawText);
  if (causeMatch && causeMatch[1].trim()) {
    rootCause = causeMatch[1].trim();
  }

  const reasonMatch = /===REASONING===([\s\S]*?)(?:===FILES===|===FILE:|$)/i.exec(rawText);
  if (reasonMatch && reasonMatch[1].trim()) {
    reasoning = reasonMatch[1].trim();
  }

  const files = parseFileBlocks(rawText);

  return {
    diagnosis,
    rootCause,
    reasoning,
    files,
    rawText
  };
}

// Diagnose and fix error in project
async function diagnoseAndFix({ errorDetails, currentFiles, onToken }) {
  const status = getAIStatus();
  if (!status.configured) {
    throw new Error(
      'AI_NOT_CONFIGURED: No AI API key is configured on the server. ' +
      'Please add GEMINI_API_KEY (recommended free tier from https://aistudio.google.com), ' +
      'ANTHROPIC_API_KEY, or OPENAI_API_KEY to your .env file to enable automated AI debugging.'
    );
  }

  const fileContext = currentFiles.map(f => `===FILE: ${f.path}===\n${f.content}\n===END_FILE===`).join('\n\n');
  const userMessage = `ACTIVE ERROR DIAGNOSTICS:
Type: ${errorDetails.type || 'Runtime Error'}
Message: ${errorDetails.message}
File: ${errorDetails.file_path || 'Unknown'}
Line: ${errorDetails.line_number || 'N/A'}
Details / Trace:
${errorDetails.stack_trace || errorDetails.message}

CURRENT PROJECT SOURCE CODE:
${fileContext}`;

  let fullResponse = '';

  if (status.activeProvider === 'gemini') {
    fullResponse = await callGeminiStream({
      systemInstruction: SYSTEM_DEBUG_PROMPT,
      userMessage,
      onToken
    });
  } else if (status.activeProvider === 'openai') {
    fullResponse = await callOpenAIStream({
      systemInstruction: SYSTEM_DEBUG_PROMPT,
      userMessage,
      onToken
    });
  } else if (status.activeProvider === 'anthropic') {
    fullResponse = await callAnthropicStream({
      systemInstruction: SYSTEM_DEBUG_PROMPT,
      userMessage,
      onToken
    });
  }

  const result = parseDiagnosisResponse(fullResponse);
  if (result.files.length === 0) {
    throw new Error('AI produced a diagnosis, but did not propose any corrected file blocks. Please retry.');
  }

  return result;
}


// -------------------------------------------------------------
// Provider Adapters using native fetch (zero extra dependencies)
// -------------------------------------------------------------

async function callGeminiStream({ systemInstruction, userMessage, onToken }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\n${userMessage}` }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const data = JSON.parse(jsonStr);
          const candidate = data.candidates?.[0];
          const partText = candidate?.content?.parts?.[0]?.text || '';
          if (partText) {
            fullText += partText;
            if (onToken) onToken(partText);
          }
        } catch (e) {}
      }
    }
  }

  return fullText;
}

async function callOpenAIStream({ systemInstruction, userMessage, onToken }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      stream: true,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;
        try {
          const json = JSON.parse(payload);
          const token = json.choices?.[0]?.delta?.content || '';
          if (token) {
            fullText += token;
            if (onToken) onToken(token);
          }
        } catch (e) {}
      }
    }
  }

  return fullText;
}

async function callAnthropicStream({ systemInstruction, userMessage, onToken }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const url = 'https://api.anthropic.com/v1/messages';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-7-sonnet-20250219',
      stream: true,
      max_tokens: 8192,
      system: systemInstruction,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API Error (${response.status}): ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim();
        try {
          const json = JSON.parse(payload);
          if (json.type === 'content_block_delta' && json.delta?.text) {
            fullText += json.delta.text;
            if (onToken) onToken(json.delta.text);
          }
        } catch (e) {}
      }
    }
  }

  return fullText;
}

module.exports = {
  getAIStatus,
  generateFiles,
  editFiles,
  diagnoseAndFix,
  parseDiagnosisResponse,
  parseFileBlocks
};
