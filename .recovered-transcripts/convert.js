const fs = require('fs');
const path = require('path');

const SOURCE_DIR = '/Users/matteobaratella/.claude/projects/-Users-matteobaratella-Projects-PERSONAL-PROJECTS-SoloEnterprise-soloenterprise';
const OUTPUT_DIR = '/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/.recovered-transcripts';

const TRANSCRIPTS = [
  ['7e1a6a1b-683c-41fd-b730-127603bcfc26.jsonl', 'Feb 17 12:32', '01'],
  ['88217deb-8baf-4dad-9cf9-8cdd0af04ae6.jsonl', 'Feb 17 14:13', '02'],
  ['98c91680-f9be-40a7-9b23-cf41872d23b2.jsonl', 'Feb 17 14:20', '03'],
  ['d6b22184-6507-4119-ad10-0bbdba95daf0.jsonl', 'Feb 17 19:52', '04'],
  ['07e6eebd-7d48-4fb8-91cc-29ec03678355.jsonl', 'Feb 17 19:59', '05'],
  ['9e0b524e-bc70-48c5-9cae-05c7e611471b.jsonl', 'Feb 17 21:01', '06'],
  ['26edca5b-7bbc-4e81-a5a3-3ebbead07789.jsonl', 'Feb 17 21:01', '07'],
  ['01206d8b-f255-442e-8831-9837712c46db.jsonl', 'Feb 17 21:01', '08'],
  ['0ef90701-730c-427b-a0aa-26d4ff5c664b.jsonl', 'Feb 17 22:47', '09'],
  ['8bac9f6b-e835-4d05-8d59-398cf17728de.jsonl', 'Feb 17 23:20', '10'],
  ['82fc0f05-761f-400e-9bc9-981e65df4dc7.jsonl', 'Feb 17 23:54', '11'],
  ['407edafa-a025-49ed-b6b0-58f81f9946f8.jsonl', 'Feb 17 23:55', '12'],
  ['db3a0b59-d665-4a7b-b6a8-e9f788ed2ff1.jsonl', 'Feb 18 00:16', '13'],
  ['1210ec8e-ee38-4239-be58-ddfaf46c02e1.jsonl', 'Feb 18 00:19', '14'],
  ['1af9c0af-60bf-4e69-8a32-672fd603b15d.jsonl', 'Feb 18 00:21', '15'],
  ['34e140b8-41cc-4d44-808c-e3178654e0e9.jsonl', 'Feb 18 00:49', '16'],
];

function formatToolUse(block) {
  const name = block.name || 'unknown';
  const inp = block.input || {};
  const lines = [];

  if (name === 'Write') {
    const filePath = inp.file_path || 'unknown';
    const content = inp.content || '';
    const ext = filePath.includes('.') ? filePath.split('.').pop() : '';
    const langMap = {ts:'typescript',tsx:'tsx',js:'javascript',py:'python',json:'json',md:'markdown',css:'css'};
    const lang = langMap[ext] || ext;
    lines.push('### Tool Call: Write');
    lines.push('**File:** `' + filePath + '`');
    lines.push('**Content:**');
    lines.push('```' + lang);
    lines.push(content);
    lines.push('```');
  } else if (name === 'Edit') {
    const filePath = inp.file_path || 'unknown';
    lines.push('### Tool Call: Edit');
    lines.push('**File:** `' + filePath + '`');
    lines.push('**Old:**');
    lines.push('```');
    lines.push(inp.old_string || '');
    lines.push('```');
    lines.push('**New:**');
    lines.push('```');
    lines.push(inp.new_string || '');
    lines.push('```');
  } else if (name === 'Bash') {
    lines.push('### Tool Call: Bash');
    if (inp.description) lines.push('**Description:** ' + inp.description);
    lines.push('```bash');
    lines.push(inp.command || '');
    lines.push('```');
  } else if (name === 'Read') {
    lines.push('### Tool Call: Read');
    lines.push('**File:** `' + (inp.file_path || 'unknown') + '`');
  } else {
    lines.push('### Tool Call: ' + name);
    for (const [k, v] of Object.entries(inp)) {
      let vs = String(v);
      if (vs.length > 500) vs = vs.slice(0, 500) + '...';
      lines.push('**' + k + ':** ' + vs);
    }
  }
  return lines.join('\n');
}

function processTranscript(jsonlPath, outputPath, sessionId, dateStr) {
  let messageCount = 0;
  const data = fs.readFileSync(jsonlPath, 'utf-8');
  const lines = data.split('\n');
  const out = [];

  out.push('# Transcript: ' + sessionId);
  out.push('## Date: ' + dateStr);
  out.push('');

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch(e) { continue; }

    const message = obj.message;
    if (!message) continue;

    const role = message.role || '';
    const content = message.content;
    if (!content) continue;

    if (role === 'user') {
      if (typeof content === 'string') {
        out.push('---');
        out.push('### Human');
        out.push(content);
        out.push('');
        messageCount++;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'text') {
            out.push('---');
            out.push('### Human');
            out.push(block.text || '');
            out.push('');
            messageCount++;
          } else if (block.type === 'tool_result') {
            const isErr = block.is_error || false;
            const prefix = isErr ? 'Tool Error' : 'Tool Result';
            out.push('### ' + prefix);
            const tc = typeof block.content === 'string' ? block.content : (block.content != null ? JSON.stringify(block.content) : '');
            if (tc && tc.length > 5000) {
              out.push('```');
              out.push(tc.slice(0, 5000) + '\n... (truncated)');
              out.push('```');
            } else {
              out.push('```');
              out.push(tc);
              out.push('```');
            }
            out.push('');
            messageCount++;
          }
        }
      }
    } else if (role === 'assistant') {
      if (typeof content === 'string') {
        if (content.trim()) {
          out.push('---');
          out.push('### Assistant');
          out.push(content);
          out.push('');
          messageCount++;
        }
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'text' && (block.text || '').trim()) {
            out.push('---');
            out.push('### Assistant');
            out.push(block.text);
            out.push('');
            messageCount++;
          } else if (block.type === 'tool_use') {
            out.push(formatToolUse(block));
            out.push('');
            messageCount++;
          }
        }
      }
    }
  }

  fs.writeFileSync(outputPath, out.join('\n'));
  return messageCount;
}

let totalMessages = 0;
let processed = 0;

for (const [filename, dateStr, num] of TRANSCRIPTS) {
  const jsonlPath = path.join(SOURCE_DIR, filename);
  const sessionId = filename.replace('.jsonl', '');
  const outputPath = path.join(OUTPUT_DIR, 'transcript-' + num + '-' + sessionId.slice(0, 8) + '.md');

  if (!fs.existsSync(jsonlPath)) {
    console.log('SKIP: ' + filename);
    continue;
  }

  const count = processTranscript(jsonlPath, outputPath, sessionId, dateStr);
  totalMessages += count;
  processed++;
  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log('OK: transcript-' + num + ' (' + count + ' messages, ' + sizeKb + ' KB)');
}

console.log('\nDone: ' + processed + ' transcripts, ' + totalMessages + ' total messages');
