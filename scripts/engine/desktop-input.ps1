# Tiny command server used by record-desktop.mjs (Windows only). Reads one command per line on stdin, answers with lines on stdout:
#   find <regex>      lists top-level windows whose title matches: ITEM|hwnd|visible|iconic|L|T|R|B|title   then   OK <count>
#   show <hwnd>       restores/shows the window and brings it to the front
#   hide <hwnd>       hides the window again (used to put a tray application back as it was)
#   move <x> <y>      moves the mouse pointer (screen coordinates)
#   lclick | rclick   a left / right mouse click at the current pointer position
#   key <keys>        SendKeys syntax, for example {ESC}
#   quit
# Nothing here clicks by itself: every action is requested by the scene script, and the recording plan lists what will be done.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class DI {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  public static void Click(bool right) { if (right) { mouse_event(0x0008, 0, 0, 0, UIntPtr.Zero); mouse_event(0x0010, 0, 0, 0, UIntPtr.Zero); } else { mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero); } }
  public static List<string> Find(string pattern) {
    var res = new List<string>(); var rx = new System.Text.RegularExpressions.Regex(pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    EnumWindows((h, l) => {
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512); var t = sb.ToString();
      if (t.Length > 0 && rx.IsMatch(t)) { RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r);
        res.Add("ITEM|" + h.ToInt64() + "|" + IsWindowVisible(h) + "|" + IsIconic(h) + "|" + r.L + "|" + r.T + "|" + r.R + "|" + r.B + "|" + t); }
      return true; }, IntPtr.Zero);
    return res;
  }
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr h, bool alt);
  // Some tray applications "hide" by parking the window far off screen: bring it back onto the primary screen, then to the front.
  public static void Show(long h) {
    IntPtr p = new IntPtr(h); ShowWindow(p, IsIconic(p) ? 9 : 1);
    RECT r; GetWindowRect(p, out r); int W = GetSystemMetrics(0), H = GetSystemMetrics(1);
    if (r.R <= 0 || r.L >= W || r.B <= 0 || r.T >= H || r.L < -1000) { int w = r.R - r.L, hh = r.B - r.T; SetWindowPos(p, IntPtr.Zero, Math.Max(0, (W - w) / 2), Math.Max(0, (H - hh) / 2), 0, 0, 0x0005); }
    SwitchToThisWindow(p, true); SetForegroundWindow(p);
  }
}
'@
function Reply($s) { [Console]::Out.WriteLine($s); [Console]::Out.Flush() }
Reply 'READY'
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $parts = $line.Trim() -split '\s+', 2
  try {
    switch ($parts[0]) {
      'find'   { $items = [DI]::Find($parts[1]); foreach ($i in $items) { Reply $i }; Reply "OK $($items.Count)" }
      'show'   { [DI]::Show([long]$parts[1]); Reply 'OK' }
      'hide'   { [DI]::ShowWindow([IntPtr][long]$parts[1], 0) | Out-Null; Reply 'OK' }
      'move'   { $xy = $parts[1] -split '\s+'; [DI]::SetCursorPos([int]$xy[0], [int]$xy[1]) | Out-Null; Reply 'OK' }
      'lclick' { [DI]::Click($false); Reply 'OK' }
      'rclick' { [DI]::Click($true); Reply 'OK' }
      'key'    { [System.Windows.Forms.SendKeys]::SendWait($parts[1]); Reply 'OK' }
      'quit'   { Reply 'OK'; break }
      default  { Reply "ERR unknown command $($parts[0])" }
    }
  } catch { Reply "ERR $($_.Exception.Message)" }
  if ($parts[0] -eq 'quit') { break }
}
