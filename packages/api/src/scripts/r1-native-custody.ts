import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
/** Rights that could modify or replace protected objects through an ancestor:
 * ADD_FILE/WRITE_DATA, ADD_SUBDIRECTORY/APPEND_DATA, WRITE_EA,
 * DELETE_CHILD, WRITE_ATTRIBUTES, DELETE, WRITE_DAC, WRITE_OWNER.
 * READ_CONTROL or ordinary read access must not be mistaken for a write right.
 */
export const R1_ANCESTOR_MUTATION_MASK =
  0x0002 | 0x0004 | 0x0010 | 0x0040 | 0x0100 |
  0x10000 | 0x40000 | 0x80000

/** Actual native Authz, including sandbox reader groups; never infer effective
 * permissions from ACE text. No ACL modification or private-content read here.
 */
export async function assertNativeR1Custody(paths:readonly string[],operatorSid:string) {
 if(process.platform!=='win32')throw Error('REFUSED: R1 effective custody requires native Windows Authz')
 if(!paths.length||!/^S-1-5-21-[0-9-]+$/i.test(operatorSid))throw Error('REFUSED: R1 custody inputs')
 const encoded=Buffer.from(JSON.stringify(paths)).toString('base64'),probe=path.join(__dirname,'r1-authz.cs').replace(/'/g,"''")
 const script=`$ErrorActionPreference='Stop'; Add-Type -Path '${probe}';
 function Get-NativeAcl([string]$p) {if([IO.Directory]::Exists($p)){[IO.Directory]::GetAccessControl($p)}else{[IO.File]::GetAccessControl($p)}};
 $actual=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
 if($actual -ne '${operatorSid}') {throw 'R1 actual token SID changed'};
 $reader='S-1-5-21-574943488-664265007-2626993283-1004';
 $paths=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json;
 foreach($p in $paths) {
  $item=Get-Item -LiteralPath $p; $acl=Get-NativeAcl $p;
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $actual -or -not $acl.AreAccessRulesProtected){throw 'R1 custody owner/inheritance'};
  $sd=$acl.GetSecurityDescriptorBinaryForm();
  if([R1AclProbe]::Check($sd,$reader) -ne 0 -or ([R1AclProbe]::Check($sd,'') -band 1) -eq 0){throw 'R1 effective read custody'};
  $cursor=$item;
  while($cursor){
   if(($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'R1 reparse ancestor'};
   $a=Get-NativeAcl $cursor.FullName;
   if(([R1AclProbe]::Check($a.GetSecurityDescriptorBinaryForm(),$reader) -band 0x${R1_ANCESTOR_MUTATION_MASK.toString(16)}) -ne 0){throw 'R1 writable ancestor'};
   $cursor=if($cursor.PSIsContainer){$cursor.Parent}else{$cursor.Directory};
  }
 }; Write-Output 'R1_NATIVE_AUTHZ_CUSTODY_VERIFIED';`
 const {stdout}=await promisify(execFile)('powershell',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')])
 if(stdout.trim()!=='R1_NATIVE_AUTHZ_CUSTODY_VERIFIED')throw Error('REFUSED: R1 native Authz proof missing')
}