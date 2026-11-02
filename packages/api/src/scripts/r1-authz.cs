using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;

// R1 local Windows authorization probe. Only a real kernel access token is
// suitable for effective-access proof. A SID-only context is NOT the sandbox
// token: it can omit logon groups, restrictions, and process privileges.
public class R1AclProbe
{
    [StructLayout(LayoutKind.Sequential)]
    struct LUID { public uint Low; public int High; }

    [StructLayout(LayoutKind.Sequential)]
    struct Req
    {
        public uint Access;
        public IntPtr Self;
        public IntPtr Types;
        public uint Count;
        public IntPtr Args;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct Rep
    {
        public uint Count;
        public IntPtr Mask;
        public IntPtr Sacl;
        public IntPtr Error;
    }

    [DllImport("authz.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool AuthzInitializeResourceManager(
        uint flags, IntPtr accessCheck, IntPtr computeGroups,
        IntPtr freeGroups, string name, out IntPtr manager);

    [DllImport("authz.dll", SetLastError = true)]
    static extern bool AuthzInitializeContextFromToken(
        uint flags, IntPtr token, IntPtr manager, IntPtr expiry,
        LUID identifier, IntPtr args, out IntPtr context);

    [DllImport("authz.dll", SetLastError = true)]
    static extern bool AuthzAccessCheck(
        uint flags, IntPtr context, ref Req request, IntPtr audit,
        byte[] descriptor, IntPtr optionalDescriptors, uint optionalCount,
        ref Rep reply, IntPtr cachedResults);

    [DllImport("authz.dll")]
    static extern bool AuthzFreeContext(IntPtr context);

    [DllImport("authz.dll")]
    static extern bool AuthzFreeResourceManager(IntPtr manager);

    public static uint Check(byte[] descriptor, string alternate)
    {
        // R1 custody currently supplies the reader's SID, not an independently
        // verified reader PROCESS TOKEN. Never report "reader denied" from a
        // reconstructed SID. This deliberately blocks R1 until actual-token
        // provenance is separately commissioned and verified.
        if (!String.IsNullOrEmpty(alternate))
            throw new InvalidOperationException(
                "BLOCKED: actual sandbox reader token is not commissioned; SID-only access checks are unsafe");

        if (descriptor == null || descriptor.Length == 0)
            throw new ArgumentException("REFUSED: missing Windows security descriptor");

        IntPtr manager = IntPtr.Zero, context = IntPtr.Zero;
        IntPtr granted = IntPtr.Zero, sacl = IntPtr.Zero, error = IntPtr.Zero;
        try
        {
            // ResultListLength=1 requires three distinct DWORD buffers.
            // In particular, AuthzAccessCheck requires SaclEvaluationResults
            // even when no audit is requested.
            granted = Marshal.AllocHGlobal(sizeof(int));
            sacl = Marshal.AllocHGlobal(sizeof(int));
            error = Marshal.AllocHGlobal(sizeof(int));
            Marshal.WriteInt32(granted, 0);
            Marshal.WriteInt32(sacl, 0);
            Marshal.WriteInt32(error, 0);

            if (!AuthzInitializeResourceManager(
                    1, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, "R1", out manager))
                throw new Win32Exception(Marshal.GetLastWin32Error());

            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                if (!AuthzInitializeContextFromToken(
                        0, identity.Token, manager, IntPtr.Zero,
                        new LUID(), IntPtr.Zero, out context))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
            }

            Req request = new Req { Access = 0x02000000 }; // MAXIMUM_ALLOWED
            Rep reply = new Rep { Count = 1, Mask = granted, Sacl = sacl, Error = error };
            if (!AuthzAccessCheck(
                    0, context, ref request, IntPtr.Zero, descriptor,
                    IntPtr.Zero, 0, ref reply, IntPtr.Zero))
                throw new Win32Exception(Marshal.GetLastWin32Error());

            int status = Marshal.ReadInt32(error);
            if (status != 0 && status != 5)
                throw new Win32Exception(status);
            return unchecked((uint)Marshal.ReadInt32(granted));
        }
        finally
        {
            if (context != IntPtr.Zero) AuthzFreeContext(context);
            if (manager != IntPtr.Zero) AuthzFreeResourceManager(manager);
            if (granted != IntPtr.Zero) Marshal.FreeHGlobal(granted);
            if (sacl != IntPtr.Zero) Marshal.FreeHGlobal(sacl);
            if (error != IntPtr.Zero) Marshal.FreeHGlobal(error);
        }
    }
}
