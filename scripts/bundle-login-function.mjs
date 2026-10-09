// Gera um único arquivo para publicação pelo editor do painel Supabase.
// A CLI usa diretamente os arquivos originais em supabase/functions/.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const credentials=await readFile('supabase/functions/_shared/credentials.ts','utf8');
const handler=await readFile('supabase/functions/_shared/username-login.ts','utf8');
const entry=await readFile('supabase/functions/username-login/index.ts','utf8');
const strip=text=>text.replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
await mkdir('outputs',{recursive:true});
await writeFile('outputs/username-login.index.ts',`// Gerado de supabase/functions; edite os originais e gere novamente.\n${strip(credentials)}\n${strip(handler)}\n${strip(entry)}`);
process.stdout.write('outputs/username-login.index.ts\n');
