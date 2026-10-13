import {createECDH,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('outputs',{recursive:true});
let secrets;
try { secrets=await readFile('outputs/birthday-push.env','utf8'); }
catch {
 try {await readFile('public/push-config.json','utf8');throw new Error('A chave pública já existe. Recupere os segredos originais; não gere outro par para um app em uso.');}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const pair=createECDH('prime256v1');pair.generateKeys();
 secrets=`VAPID_PUBLIC_KEY=${pair.getPublicKey().toString('base64url')}\nVAPID_PRIVATE_KEY=${pair.getPrivateKey().toString('base64url')}\nBIRTHDAY_CRON_SECRET=${randomBytes(32).toString('base64url')}\n`;
 await writeFile('outputs/birthday-push.env',secrets,{mode:0o600});
}
const publicKey=secrets.match(/^VAPID_PUBLIC_KEY=(.+)$/m)?.[1];
if(!publicKey)throw new Error('Chaves existentes inválidas.');
await writeFile('public/push-config.json',JSON.stringify({publicKey})+'\n');
console.log('Chave pública preparada. Segredos permanecem em outputs/birthday-push.env (fora do Git).');
