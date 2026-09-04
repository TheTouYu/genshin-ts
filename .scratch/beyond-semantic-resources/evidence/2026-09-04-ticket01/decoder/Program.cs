using System;
using System.IO;
using System.Reflection;

class Program
{
    static void Main()
    {
        string dir = @"E:\ys\Genshin Impact Game\BeyondAssets\BeyondAssistEditor";
        string dll = Path.Combine(dir, "BeyondEditor.dll");
        AppDomain.CurrentDomain.AssemblyResolve += (s, e) =>
        {
            string name = new AssemblyName(e.Name).Name + ".dll";
            string p = Path.Combine(dir, name);
            return File.Exists(p) ? Assembly.LoadFile(p) : null;
        };

        Console.WriteLine("Loading " + dll);
        Assembly asm = Assembly.LoadFile(dll);
        Type target = asm.GetType("YlKu2QYfNaDsptndNkxX", false);
        if (target == null) { Console.WriteLine("TYPE_NOT_FOUND"); return; }

        var field = target.GetField("EOHYfjqMv7P", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
        var method = target.GetMethod("xyVYfsr3qg0", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
        if (field == null || method == null) { Console.WriteLine("FIELD_METHOD_NOT_FOUND"); return; }

        object del = null;
        try { del = field.GetValue(null); Console.WriteLine("DEL_OK " + del?.GetType()); }
        catch (Exception ex) { Console.WriteLine("DEL_ERR " + ex); return; }

        // Constants observed around ZipInputStream/assets.bin loading and common decoder call sites.
        int[] args = {
            0x45AFE705 ^ 0x45AE48AF,          // candidate 1 (path?)
            0x30120A8F ^ 0x3013A561,          // candidate 2 (password?)
            0x30120A8F ^ 0x30120B21,
            -637382682 ^ -637382682,
            -830285908 ^ -830285892,
            -1185114171 ^ -1184964129,
            0x7ECDCC0B ^ 0x7ECFBAA5,
            -1347725427 ^ 0x5054A55D,
            0x45AFE705 ^ 0x45AE48AF,
            -531691220 ^ -531691220,
            0x64040753 ^ 0x6404034D,
            0x76DD0BC3 ^ 0x76DD0887,
        };

        foreach (var a in args)
        {
            try
            {
                object res = method.Invoke(null, new object[] { a, del });
                Console.WriteLine("ARG " + a + " (0x" + ((uint)a).ToString("X8") + ") => " + res);
            }
            catch (Exception ex)
            {
                Console.WriteLine("ARG " + a + " ERR " + ex.Message);
            }
        }
    }
}
