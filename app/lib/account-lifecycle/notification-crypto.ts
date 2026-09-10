import 'server-only'

import {createCipheriv,createDecipheriv,randomBytes}from'node:crypto'

type Envelope={v:1;iv:string;tag:string;ciphertext:string}
function key(){const raw=process.env.LIFECYCLE_NOTIFICATION_ENCRYPTION_KEY;if(!raw)throw new Error('NOTIFICATION_KEY_UNAVAILABLE');const value=Buffer.from(raw,'base64');if(value.length!==32)throw new Error('NOTIFICATION_KEY_UNAVAILABLE');return value}
export function encryptNotificationRecipient(email:string){const normalized=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254)throw new Error('NOTIFICATION_RECIPIENT_INVALID');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const ciphertext=Buffer.concat([cipher.update(normalized,'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}satisfies Envelope)}
export function decryptNotificationRecipient(value:string){let parsed:Envelope;try{parsed=JSON.parse(value)as Envelope}catch{throw new Error('NOTIFICATION_RECIPIENT_INVALID')}if(parsed.v!==1)throw new Error('NOTIFICATION_RECIPIENT_INVALID');const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(parsed.iv,'base64'));decipher.setAuthTag(Buffer.from(parsed.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(parsed.ciphertext,'base64')),decipher.final()]).toString('utf8')}
