import {ConversationShell} from '../components/guided/ConversationShell'
import {LoadingLines} from '../components/experience/LoadingLines'
export default function CheckInLoading(){
 return <ConversationShell progress="Opening your check-in" state="question"><div aria-busy="true"><h1>Let’s see where we are.</h1><LoadingLines/></div></ConversationShell>
}
