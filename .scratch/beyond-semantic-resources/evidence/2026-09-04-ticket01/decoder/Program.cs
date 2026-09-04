using System;
using System.IO;
using System.Reflection;

class Program
{
    static void Main(string[] args)
    {
        string dir = @"E:\ys\Genshin Impact Game\BeyondAssets\BeyondAssistEditor";
        string dll = Path.Combine(dir, "BeyondEditor.dll");
        string argFile = args.Length > 0 ? args[0] : "DecoderArgs.txt";
        string outFile = args.Length > 1 ? args[1] : "DecoderOutput.txt";

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

        if (!File.Exists(argFile))
        {
            Console.WriteLine("ARGS_FILE_NOT_FOUND " + Path.GetFullPath(argFile));
            return;
        }

        string[] lines = File.ReadAllLines(argFile);
        using var writer = new StreamWriter(outFile, false, System.Text.Encoding.UTF8);
        int ok = 0, err = 0;
        foreach (var raw in lines)
        {
            var text = raw.Trim();
            if (text.Length == 0 || text.StartsWith("#")) continue;
            if (!int.TryParse(text, out int a))
            {
                Console.WriteLine("BAD_ARG " + text);
                continue;
            }
            try
            {
                object res = method.Invoke(null, new object[] { a, del });
                writer.WriteLine(a + "\t" + res);
                ok++;
            }
            catch (Exception ex)
            {
                writer.WriteLine(a + "\tERR " + ex.Message);
                err++;
            }
        }
        Console.WriteLine($"DONE ok={ok} err={err} -> {Path.GetFullPath(outFile)}");
    }
}
