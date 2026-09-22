import type {ReactNode} from 'react'

/** Shared presentation primitives. Callers retain all field and submission behavior. */
export function WorkspaceField({label,children,hint,className=''}:{label:string;children:ReactNode;hint?:string;className?:string}) {
 return <label className={`workspace-field ${className}`}><span>{label}{hint&&<small>{hint}</small>}</span>{children}</label>
}
export function WorkspaceGroup({title,children,className=''}:{title:string;children:ReactNode;className?:string}) {
 return <fieldset className={`workspace-group ${className}`}><legend>{title}</legend><div>{children}</div></fieldset>
}
export function WorkspaceDisclosure({title,children,open,className=''}:{title:string;children:ReactNode;open?:boolean;className?:string}) {
 return <details className={`workspace-disclosure ${className}`} open={open||undefined}><summary>{title}<span aria-hidden="true">＋</span></summary><div>{children}</div></details>
}
export function WorkspaceEmpty({title,children}:{title:string;children:ReactNode}) {
 return <div className="workspace-empty"><span className="workspace-empty-mark" aria-hidden="true">—</span><div><h3>{title}</h3><p>{children}</p></div></div>
}
