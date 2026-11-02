using System;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

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


    // Available only for an independently pinned, live sandbox process.
    // This API does NOT commission a PID: the caller must obtain process ID,
    // creation FILETIME, executable path, and SID from a separately approved
    // and signed reader binding. Never infer them from an env variable.
    [StructLayout(LayoutKind.Sequential)]
    struct FileTime { public uint Low; public uint High; }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetProcessTimes(
        IntPtr process, out FileTime created, out FileTime exited,
        out FileTime kernel, out FileTime user);

    [DllImport("kernel32.dll", SetLastError = true,
        CharSet = CharSet.Unicode, EntryPoint = "QueryFullProcessImageNameW")]
    static extern bool QueryFullProcessImageName(
        IntPtr process, uint flags, StringBuilder image, ref uint length);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr handle);

    // This checks ONE actual primary process token, not arbitrary SID groups
    // or impersonating thread tokens. Caller must separately prove it is the
    // exact sandbox actor and that the token scope is representative.
    public static uint CheckVerifiedReaderProcess(
        byte[] descriptor, int processId, string expectedCreationFileTimeUtc,
        string expectedSid, string expectedImagePath)
    {
        ulong expectedCreated;
        if (processId <= 0 ||
            !UInt64.TryParse(expectedCreationFileTimeUtc, NumberStyles.None,
                CultureInfo.InvariantCulture, out expectedCreated) ||
            expectedCreated == 0 ||
            String.IsNullOrWhiteSpace(expectedSid) ||
            String.IsNullOrWhiteSpace(expectedImagePath) ||
            !Path.IsPathRooted(expectedImagePath))
            throw new InvalidOperationException(
                "BLOCKED: complete independently approved sandbox process identity required");

        // Validate SID syntax before touching a process.
        string pinnedSid = new SecurityIdentifier(expectedSid).Value;
        IntPtr process = IntPtr.Zero, token = IntPtr.Zero;
        try
        {
            // PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE; no debug privilege.
            process = OpenProcess(0x00101000, false, unchecked((uint)processId));
            if (process == IntPtr.Zero)
                throw new Win32Exception(Marshal.GetLastWin32Error());

            FileTime created, exited, kernel, user;
            if (!GetProcessTimes(process, out created, out exited, out kernel, out user))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            ulong actualCreated = ((ulong)created.High << 32) | created.Low;
            if (actualCreated != expectedCreated)
                throw new InvalidOperationException("REFUSED: sandbox PID/start-time mismatch");

            StringBuilder executable = new StringBuilder(32768);
            uint length = (uint)executable.Capacity;
            if (!QueryFullProcessImageName(process, 0, executable, ref length))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            string actualImage = Path.GetFullPath(executable.ToString());
            string expectedImage = Path.GetFullPath(expectedImagePath);
            if (!String.Equals(actualImage, expectedImage, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("REFUSED: sandbox executable mismatch");

            // A terminated or recycled process is not acceptable proof.
            if (WaitForSingleObject(process, 0) != 258)
                throw new InvalidOperationException("REFUSED: sandbox process not live");
            if (!OpenProcessToken(process, 0x0008, out token)) // TOKEN_QUERY only
                throw new Win32Exception(Marshal.GetLastWin32Error());
            using (WindowsIdentity identity = new WindowsIdentity(token))
            {
                if (identity.User == null ||
                    !String.Equals(identity.User.Value, pinnedSid,
                        StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("REFUSED: sandbox token SID mismatch");
            }

            uint granted = CheckUsingToken(descriptor, token);
            if (WaitForSingleObject(process, 0) != 258)
                throw new InvalidOperationException("REFUSED: sandbox process exited during proof");
            return granted;
        }
        finally
        {
            if (token != IntPtr.Zero) CloseHandle(token);
            if (process != IntPtr.Zero) CloseHandle(process);
        }
    }

    public static uint Check(byte[] descriptor, string alternate)
    {
        // R1 custody currently supplies the reader's SID, not an independently
        // verified reader PROCESS TOKEN. Never report "reader denied" from a
        // reconstructed SID. This deliberately blocks R1 until actual-token
        // provenance is separately commissioned and verified.
        if (!String.IsNullOrEmpty(alternate))
            throw new InvalidOperationException(
                "BLOCKED: actual sandbox reader token is not commissioned; SID-only access checks are unsafe");

        using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            return CheckUsingToken(descriptor, identity.Token);
    }

    private static uint CheckUsingToken(byte[] descriptor, IntPtr accessToken)
    {
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

            if (accessToken == IntPtr.Zero)
                throw new InvalidOperationException("REFUSED: missing actual Windows token");
            if (!AuthzInitializeContextFromToken(
                    0, accessToken, manager, IntPtr.Zero,
                    new LUID(), IntPtr.Zero, out context))
                throw new Win32Exception(Marshal.GetLastWin32Error());

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
