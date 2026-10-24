using System; using System.Runtime.InteropServices; using System.Security.Principal;
public class R1AclProbe {
 [StructLayout(LayoutKind.Sequential)] struct LUID {public uint Low;public int High;}
 [StructLayout(LayoutKind.Sequential)] struct Req {public uint Access;public IntPtr Self;public IntPtr Types;public uint Count;public IntPtr Args;}
 [StructLayout(LayoutKind.Sequential)] struct Rep {public uint Count;public IntPtr Mask;public IntPtr Sacl;public IntPtr Error;}
 [DllImport("authz.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool AuthzInitializeResourceManager(uint f,IntPtr a,IntPtr b,IntPtr c,string n,out IntPtr rm);
 [DllImport("authz.dll",SetLastError=true)] static extern bool AuthzInitializeContextFromToken(uint f,IntPtr t,IntPtr rm,IntPtr e,LUID id,IntPtr a,out IntPtr ctx);
 [DllImport("authz.dll",SetLastError=true)] static extern bool AuthzInitializeContextFromSid(uint f,byte[] sid,IntPtr rm,IntPtr e,LUID id,IntPtr a,out IntPtr ctx);
 [DllImport("authz.dll",SetLastError=true)] static extern bool AuthzAccessCheck(uint f,IntPtr ctx,ref Req req,IntPtr audit,byte[] sd,IntPtr opt,uint cnt,ref Rep rep,IntPtr results);
 [DllImport("authz.dll")] static extern bool AuthzFreeContext(IntPtr c);
 [DllImport("authz.dll")] static extern bool AuthzFreeResourceManager(IntPtr r);
 public static uint Check(byte[] sd,string alternate) {
 IntPtr rm=IntPtr.Zero,ctx=IntPtr.Zero,m=Marshal.AllocHGlobal(4),e=Marshal.AllocHGlobal(4);
 try { if(!AuthzInitializeResourceManager(1,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,"R1",out rm))throw new System.ComponentModel.Win32Exception();
 bool ok; if(String.IsNullOrEmpty(alternate)) ok=AuthzInitializeContextFromToken(0,WindowsIdentity.GetCurrent().Token,rm,IntPtr.Zero,new LUID(),IntPtr.Zero,out ctx);
 else {var sid=new SecurityIdentifier(alternate);var b=new byte[sid.BinaryLength];sid.GetBinaryForm(b,0);ok=AuthzInitializeContextFromSid(0,b,rm,IntPtr.Zero,new LUID(),IntPtr.Zero,out ctx);}
 if(!ok)throw new System.ComponentModel.Win32Exception();var q=new Req{Access=0x02000000};var r=new Rep{Count=1,Mask=m,Error=e};
 if(!AuthzAccessCheck(0,ctx,ref q,IntPtr.Zero,sd,IntPtr.Zero,0,ref r,IntPtr.Zero))throw new System.ComponentModel.Win32Exception();int err=Marshal.ReadInt32(e);if(err!=0 && err!=5)throw new System.ComponentModel.Win32Exception(err);return unchecked((uint)Marshal.ReadInt32(m));
 }finally{if(ctx!=IntPtr.Zero)AuthzFreeContext(ctx);if(rm!=IntPtr.Zero)AuthzFreeResourceManager(rm);Marshal.FreeHGlobal(m);Marshal.FreeHGlobal(e);}}
}