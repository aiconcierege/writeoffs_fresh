export const publicBarrierSql:string
export const restoreIsolationSql:string
export const hostedDrRef: string
export interface HostedDrConfig {id:string;host:string;dbPassword:string;recoveryApiKey:string;storageControllerJwt:string;retiredPublicKeys:Array<string|{api_key:string}>}
export function validateHostedDrConfig(config:HostedDrConfig):HostedDrConfig
export function hostedDrTarget(config:HostedDrConfig,caFile:string):{
 sql(query:string):string;
 restore(dump:Buffer):unknown;
 privateRequest(path:string,options?:RequestInit):Promise<Response>;
 verifyPublicApis():Promise<boolean>;
 verifyPrivateObject(bucket:string,path:string):Promise<boolean>;
 applyBarrier():void;
 verifyBarrier():boolean;
 writeCa(path:string,certificate:string):void;
}
