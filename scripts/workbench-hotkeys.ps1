param(
    [string]$BaseUrl = 'http://127.0.0.1:5173',
    [switch]$ValidateOnly
)

# Windows PowerShell 5.1 reads this file as UTF-8 with BOM.
# ValidateOnly compiles the companion without registering keys, reading the
# clipboard, sending input, contacting the workbench, or showing a window.
$ErrorActionPreference = 'Stop'
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
    throw '请使用 start-hotkeys.cmd 启动，快捷键助手需要 STA 线程。'
}
$workbenchUri = [Uri]$BaseUrl
if ($workbenchUri.Scheme -ne 'http' -or $workbenchUri.Host -ne '127.0.0.1' -or
    $workbenchUri.AbsolutePath -ne '/' -or $workbenchUri.Query -or $workbenchUri.UserInfo) {
    throw '快捷键助手仅连接 http://127.0.0.1:端口 的本地工坊。'
}

$companionCode = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace PoE2WorkbenchHotkeys {
    public static class OverlayLocale {
        private static Dictionary<string, string[]> messages = new Dictionary<string, string[]>();
        private static List<string> keys = new List<string>();
        public static string Language = "zh-CN";
        public static void Initialize(string catalogPath, string preferencePath) {
            messages = new JavaScriptSerializer().Deserialize<Dictionary<string, string[]>>(File.ReadAllText(catalogPath, Encoding.UTF8));
            keys = new List<string>(messages.Keys); keys.Sort(delegate(string a, string b) { return b.Length.CompareTo(a.Length); });
            try {
                Dictionary<string, object> saved = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(preferencePath, Encoding.UTF8));
                object value; if (saved.TryGetValue("locale", out value)) SetLanguage(Convert.ToString(value));
            } catch { }
        }
        public static bool SetLanguage(string language) {
            if (language != "zh-CN" && language != "en" && language != "ja" || language == Language) return false;
            Language = language; return true;
        }
        public static string T(string source) {
            if (String.IsNullOrEmpty(source) || Language == "zh-CN") return source;
            int column = Language == "en" ? 0 : 1;
            string[] exact;
            if (messages.TryGetValue(source, out exact)) return exact[column];
            string[] lines = source.Replace("\r\n", "\n").Split('\n');
            for (int line = 0; line < lines.Length; line++) {
                foreach (string key in keys) {
                    if (!key.Contains("{0}")) continue;
                    string pattern = "^" + Regex.Replace(Regex.Escape(key), @"\\\{(\d+)}", "(.*?)") + "$";
                    Match match = Regex.Match(lines[line], pattern);
                    if (!match.Success) continue;
                    string translated = messages[key][column];
                    for (int index = 1; index < match.Groups.Count; index++) translated = translated.Replace("{" + (index - 1) + "}", match.Groups[index].Value);
                    lines[line] = translated; break;
                }
            }
            string result = String.Join("\r\n", lines);
            foreach (string key in keys) if (!key.Contains("{0}")) result = result.Replace(key, messages[key][column]);
            return result;
        }
    }
    internal static class Native {
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
        [DllImport("user32.dll")] internal static extern bool UnregisterHotKey(IntPtr hWnd, int id);
        [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll")] internal static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] internal static extern uint GetClipboardSequenceNumber();
        [DllImport("user32.dll")] internal static extern bool ReleaseCapture();
        [DllImport("user32.dll")] internal static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
        internal static bool Down(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }
        internal static bool GameIsForeground() {
            uint processId;
            GetWindowThreadProcessId(GetForegroundWindow(), out processId);
            try {
                using (Process process = Process.GetProcessById((int)processId)) {
                    return Program.IsSupportedGameProcess(process.ProcessName);
                }
            } catch { return false; }
        }
    }

    internal sealed class HotkeyWindow : NativeWindow, IDisposable {
        internal event Action<int> Pressed;
        internal HotkeyWindow() {
            CreateHandle(new CreateParams { Caption = "PoE2 Workbench Hotkeys", Parent = new IntPtr(-3) });
        }
        protected override void WndProc(ref Message message) {
            if (message.Msg == 0x0312 && Pressed != null) Pressed(message.WParam.ToInt32());
            base.WndProc(ref message);
        }
        public void Dispose() {
            Native.UnregisterHotKey(Handle, 1);
            Native.UnregisterHotKey(Handle, 2);
            DestroyHandle();
        }
    }

    // Showing this tool window does not take keyboard focus away from the game.
    internal sealed class StatusPanel : Form {
        internal readonly Label Heading = new Label();
        internal readonly TextBox Description = new TextBox();
        internal readonly Label Item = new Label();
        internal readonly Button OpenWorkbench = new Button();
        internal readonly Button OpenResult = new Button();
        internal readonly TextBox Snapshot = new TextBox();
        internal readonly TrackBar Transparency = new TrackBar();
        private readonly Button snapshotToggle = new Button();
        private readonly Label opacityLabel = new Label();
        private readonly Label caption = new Label();
        private readonly Button hide = new Button();
        private string originalHeading = "", originalDescription = "", originalItem = "";
        private bool snapshotExpanded;
        private readonly string preferencesPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PoE2CraftWorkbench", "overlay-opacity.txt");
        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams {
            get { CreateParams value = base.CreateParams; value.ExStyle |= 0x08000000; return value; }
        }
        internal StatusPanel() {
            Text = "PoE2 做装工坊 · 快捷查价";
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(520, 292);
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(24, 29, 23); ForeColor = Color.FromArgb(230, 234, 218);
            Font = new Font("Microsoft YaHei UI", 9F);
            caption.SetBounds(16, 10, 440, 22); caption.Text = "POE2 工坊  /  快捷查价 · 拖动此处移动";
            caption.ForeColor = Color.FromArgb(160, 175, 142);
            caption.MouseDown += delegate(object sender, MouseEventArgs args) {
                if (args.Button == MouseButtons.Left) { Native.ReleaseCapture(); Native.SendMessage(Handle, 0x00A1, new IntPtr(2), IntPtr.Zero); }
            };
            Button close = new Button(); close.SetBounds(480, 6, 28, 26); close.Text = "×"; close.Click += delegate { Hide(); };
            Item.SetBounds(16, 42, 488, 28); Item.AutoEllipsis = true; Item.Font = new Font(Font.FontFamily, 11F, FontStyle.Bold);
            Item.ForeColor = Color.FromArgb(221, 201, 142);
            Heading.SetBounds(16, 78, 488, 40); Heading.Font = new Font(Font.FontFamily, 10F, FontStyle.Bold);
            Heading.ForeColor = Color.FromArgb(195, 213, 155);
            Description.SetBounds(16, 124, 488, 68);
            Description.Multiline = true; Description.ReadOnly = true; Description.BorderStyle = BorderStyle.None;
            Description.BackColor = BackColor; Description.ForeColor = ForeColor; Description.ScrollBars = ScrollBars.None;
            OpenWorkbench.SetBounds(16, 204, 156, 32); OpenWorkbench.Text = "在工坊查看";
            OpenResult.SetBounds(182, 204, 156, 32); OpenResult.Text = "官方市场 ↗"; OpenResult.Enabled = false;
            hide.SetBounds(348, 204, 156, 32); hide.Text = "收起 (Esc)";
            hide.Click += delegate { Hide(); };
            snapshotToggle.SetBounds(16, 250, 100, 28); snapshotToggle.Text = "物品原文 ▸"; snapshotToggle.Enabled = false;
            Snapshot.SetBounds(16, 296, 488, 168); Snapshot.Multiline = true; Snapshot.ReadOnly = true;
            Snapshot.ScrollBars = ScrollBars.Vertical; Snapshot.BackColor = BackColor; Snapshot.ForeColor = ForeColor;
            Snapshot.BorderStyle = BorderStyle.FixedSingle; Snapshot.Visible = false;
            snapshotToggle.Click += delegate {
                ToggleSnapshot();
                Rectangle area = Screen.FromControl(this).WorkingArea;
                Location = new Point(Math.Max(area.Left, Math.Min(Left, area.Right - Width)), Math.Max(area.Top, Math.Min(Top, area.Bottom - Height)));
            };
            opacityLabel.SetBounds(126, 256, 135, 20);
            Transparency.SetBounds(268, 246, 236, 34); Transparency.Minimum = 70; Transparency.Maximum = 100;
            Transparency.TickStyle = TickStyle.None; Transparency.AutoSize = false; Transparency.SmallChange = 5; Transparency.LargeChange = 10;
            Transparency.BackColor = BackColor;
            int savedOpacity = 90;
            try { int stored; if (File.Exists(preferencesPath) && Int32.TryParse(File.ReadAllText(preferencesPath), out stored)) savedOpacity = Math.Max(70, Math.Min(100, stored)); } catch { }
            Transparency.Value = savedOpacity; ApplyOpacity();
            Transparency.ValueChanged += delegate { ApplyOpacity(); };
            Transparency.MouseUp += delegate { SaveOpacity(); };
            Transparency.KeyUp += delegate { SaveOpacity(); };
            foreach (Button button in new Button[] { OpenWorkbench, OpenResult, hide, close, snapshotToggle }) {
                button.FlatStyle = FlatStyle.Flat; button.ForeColor = ForeColor; button.BackColor = Color.FromArgb(47, 57, 42);
                button.FlatAppearance.BorderColor = Color.FromArgb(76, 89, 63); button.TabStop = false;
            }
            Controls.AddRange(new Control[] { caption, close, Heading, Description, Item, OpenWorkbench, OpenResult, hide, snapshotToggle, Snapshot, opacityLabel, Transparency });
            Padding = new Padding(1);
            FormClosing += delegate(object sender, FormClosingEventArgs args) {
                if (args.CloseReason == CloseReason.UserClosing) { args.Cancel = true; Hide(); }
            };
            ApplyLocale();
        }
        internal void ApplyLocale() {
            Text = OverlayLocale.T("PoE2 做装工坊 · 快捷查价");
            caption.Text = OverlayLocale.T("POE2 工坊  /  快捷查价 · 拖动此处移动");
            OpenWorkbench.Text = OverlayLocale.T("在工坊查看"); OpenResult.Text = OverlayLocale.T("官方市场 ↗");
            hide.Text = OverlayLocale.T("收起 (Esc)");
            snapshotToggle.Text = OverlayLocale.T(snapshotExpanded ? "物品原文 ▾" : "物品原文 ▸");
            ApplyOpacity();
            Heading.Text = OverlayLocale.T(originalHeading); Description.Text = OverlayLocale.T(originalDescription);
            Item.Text = String.IsNullOrEmpty(originalItem) ? OverlayLocale.T("PoE2 · 物品查价") : originalItem;
            Description.ScrollBars = Description.Text.Length > 120 || Description.Text.Split('\n').Length > 3 ? ScrollBars.Vertical : ScrollBars.None;
        }
        private void ApplyOpacity() { Opacity = Transparency.Value / 100.0; opacityLabel.Text = OverlayLocale.T("不透明度 ") + Transparency.Value + "%"; }
        private void SaveOpacity() {
            try { Directory.CreateDirectory(Path.GetDirectoryName(preferencesPath)); File.WriteAllText(preferencesPath, Transparency.Value.ToString()); } catch { }
        }
        internal void ToggleSnapshot() {
            snapshotExpanded = !snapshotExpanded; Snapshot.Visible = snapshotExpanded;
            snapshotToggle.Text = OverlayLocale.T(snapshotExpanded ? "物品原文 ▾" : "物品原文 ▸");
            // Use scaled control bounds, so expansion also works at 125% / 150% DPI.
            ClientSize = new Size(ClientSize.Width, (snapshotExpanded ? Snapshot.Bottom : Transparency.Bottom) + Snapshot.Left);
        }
        protected override void OnPaint(PaintEventArgs args) {
            base.OnPaint(args);
            using (Pen border = new Pen(Color.FromArgb(76, 89, 63))) args.Graphics.DrawRectangle(border, 0, 0, ClientSize.Width - 1, ClientSize.Height - 1);
        }
        internal void SetSnapshot(string raw) {
            Snapshot.Text = raw; Snapshot.SelectionStart = 0; Snapshot.SelectionLength = 0;
            snapshotToggle.Enabled = !String.IsNullOrEmpty(raw);
        }
        internal void ShowLast() {
            Display(String.IsNullOrEmpty(originalHeading) ? "等待查价" : originalHeading,
                String.IsNullOrEmpty(originalHeading) ? "在游戏内指向物品，按 Alt+E。复制成功后即可移开鼠标。" : originalDescription, originalItem);
        }
        internal void Display(string title, string description, string item, bool show = true) {
            originalHeading = title;
            originalItem = item;
            originalDescription = String.IsNullOrWhiteSpace(description) ? "本次物品快照已保留。可展开“物品原文”核对，或在工坊调整条件。复制成功后无需继续悬停。" : description;
            ApplyLocale();
            Description.SelectionStart = 0; Description.SelectionLength = 0; Description.ScrollToCaret();
            if (!Visible && show) {
                Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
                Location = new Point(area.Right - Width - 20, area.Bottom - Height - 20);
                Show();
            }
        }
    }

    internal sealed class LocalClient : WebClient {
        internal LocalClient() { Encoding = Encoding.UTF8; Proxy = null; }
        protected override WebRequest GetWebRequest(Uri address) {
            WebRequest request = base.GetWebRequest(address);
            request.Timeout = 5000;
            return request;
        }
    }

    internal sealed class CompanionContext : ApplicationContext {
        private readonly string origin;
        private readonly string launcherPath;
        private readonly HotkeyWindow window;
        private readonly StatusPanel panel;
        private readonly NotifyIcon tray;
        private readonly System.Windows.Forms.Timer timer;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private LocalClient postClient, pollClient, viewClient, localeClient;
        private DateTime nextLocalePoll, localeDeadline;
        private Process launcher;
        private int generation, capturePhase;
        private string mode = "trade", resultId, resultUrl, itemSummary = "", capturedRaw = "";
        private uint clipboardSequence;
        private DateTime captureDeadline, postDeadline, pollDeadline, nextPoll, resultDeadline, launchDeadline, viewDeadline;
        private bool escapeWasDown, disposed;

        internal CompanionContext(string baseUrl, string startupScript) {
            origin = baseUrl.TrimEnd('/');
            launcherPath = startupScript;
            window = new HotkeyWindow();
            uint priceModifiers = 0x0001 | 0x4000; // Alt + no repeat
            uint checkpointModifiers = 0x0001 | 0x0002 | 0x4000; // Alt + Ctrl + no repeat
            bool priceKey = Native.RegisterHotKey(window.Handle, 1, priceModifiers, (uint)Keys.E);
            bool checkpointKey = Native.RegisterHotKey(window.Handle, 2, checkpointModifiers, (uint)Keys.G);
            if (!priceKey || !checkpointKey) {
                if (priceKey) Native.UnregisterHotKey(window.Handle, 1);
                if (checkpointKey) Native.UnregisterHotKey(window.Handle, 2);
                window.Dispose();
                string keys = (!priceKey ? "Alt+E" : "") + (!priceKey && !checkpointKey ? "、" : "") + (!checkpointKey ? "Ctrl+Alt+G" : "");
                throw new InvalidOperationException(keys + " 已被其他程序占用。\r\nPoE Overlay II 默认也使用 Alt+E 查价；若同时运行，请在它的快捷键设置里修改 Evaluate 的按键，或退出其中一个查价助手，再重启本助手。");
            }
            panel = new StatusPanel();
            panel.OpenWorkbench.Click += delegate { OpenWorkbench(); };
            panel.OpenResult.Click += delegate { if (!String.IsNullOrEmpty(resultUrl)) OpenUrl(resultUrl); };
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("打开做装工坊", null, delegate { OpenWorkbench(); });
            menu.Items.Add("显示上次查价", null, delegate { panel.ShowLast(); });
            menu.Items.Add("显示快捷键说明", null, delegate {
                panel.Display("游戏内快捷键", "鼠标指向装备：\r\nAlt+E：高级复制装备并查价\r\nCtrl+Alt+G：高级复制并核对当前制作锚点\r\n\r\n请先启动并打开本地工坊。Esc 收起面板。\r\n网页负责计算；本助手只发送一次 Ctrl+Alt+C 高级复制。", itemSummary);
            });
            menu.Items.Add("退出快捷键助手", null, delegate { ExitThread(); });
            foreach (ToolStripItem entry in menu.Items) entry.Tag = entry.Text;
            tray = new NotifyIcon { Icon = SystemIcons.Information, Text = "PoE2 工坊 · Alt+E 查价 · Ctrl+Alt+G 核对", ContextMenuStrip = menu, Visible = true };
            ApplyLocale();
            tray.DoubleClick += delegate { OpenWorkbench(); };
            window.Pressed += BeginCapture;
            timer = new System.Windows.Forms.Timer { Interval = 100 };
            timer.Tick += Tick; timer.Start();
            tray.ShowBalloonTip(4000, OverlayLocale.T("PoE2 快捷键助手已启动"), OverlayLocale.T("游戏内指向装备：Alt+E 查价，Ctrl+Alt+G 核对制作锚点。右键托盘图标可退出。"), ToolTipIcon.Info);
        }

        private void ApplyLocale() {
            panel.ApplyLocale();
            tray.Text = OverlayLocale.T("PoE2 工坊 · Alt+E 查价 · Ctrl+Alt+G 核对");
            foreach (ToolStripItem entry in tray.ContextMenuStrip.Items) entry.Text = OverlayLocale.T(Convert.ToString(entry.Tag));
        }
        private void PollLocale() {
            nextLocalePoll = DateTime.UtcNow.AddSeconds(2);
            LocalClient client = new LocalClient(); localeClient = client; localeDeadline = DateTime.UtcNow.AddSeconds(5);
            client.DownloadStringCompleted += delegate(object sender, DownloadStringCompletedEventArgs response) {
                if (disposed || !Object.ReferenceEquals(localeClient, client)) { client.Dispose(); return; }
                localeClient = null; client.Dispose();
                if (response.Cancelled || response.Error != null) return;
                try {
                    Dictionary<string, object> value = json.Deserialize<Dictionary<string, object>>(response.Result);
                    if (OverlayLocale.SetLanguage(Text(value, "locale"))) ApplyLocale();
                } catch { /* Keep the saved language while the local service is restarting. */ }
            };
            try { client.DownloadStringAsync(new Uri(origin + "/api/workbench/companion-locale")); }
            catch { localeClient = null; client.Dispose(); }
        }

        private void BeginCapture(int hotkey) {
            if (!Native.GameIsForeground()) return;
            generation++;
            CancelRequests();
            if (launcher != null) { launcher.Dispose(); launcher = null; }
            capturedRaw = "";
            resultId = null; resultUrl = null; itemSummary = ""; panel.OpenResult.Enabled = false;
            mode = hotkey == 2 ? "checkpoint" : "trade";
            capturePhase = 1; captureDeadline = DateTime.UtcNow.AddSeconds(3);
            // An old overlay can cover the hovered tooltip and invalidate the copy.
            // Show the new panel only after a complete snapshot (or an error).
            panel.Hide(); panel.SetSnapshot("");
        }

        private void Tick(object sender, EventArgs args) {
            DateTime now = DateTime.UtcNow;
            if (localeClient != null && now > localeDeadline) { localeClient.CancelAsync(); localeClient.Dispose(); localeClient = null; }
            if (localeClient == null && now >= nextLocalePoll) PollLocale();
            if (launcher != null) {
                if (launcher.HasExited) {
                    int exitCode = launcher.ExitCode; launcher.Dispose(); launcher = null;
                    if (exitCode == 0) OpenCapturedItem();
                    else DisplayError("工坊启动失败，请运行 start-workbench.cmd 检查后重试。");
                } else if (now > launchDeadline) {
                    launcher.Dispose(); launcher = null;
                    DisplayError("等待工坊启动超时。已保留本次装备，请稍后重新点击“在工坊查看”。");
                }
            }
            if (viewClient != null && now > viewDeadline) {
                viewClient.CancelAsync(); viewClient.Dispose(); viewClient = null;
                DisplayError("打开装备页面超时。已保留本次装备，请重新点击“在工坊查看”。");
            }
            bool escapeDown = Native.Down((int)Keys.Escape);
            if (escapeDown && !escapeWasDown && panel.Visible) panel.Hide();
            escapeWasDown = escapeDown;
            if (capturePhase != 0) {
                if (!Native.GameIsForeground()) { capturePhase = 0; DisplayError("已取消：游戏窗口失去焦点，请回到游戏后重试。"); }
                else if (capturePhase == 1) {
                    if (now > captureDeadline) { capturePhase = 0; DisplayError("请松开 Ctrl、Alt、Shift 后重新尝试。"); }
                    else if (!Native.Down(0x11) && !Native.Down(0x12) && !Native.Down(0x10)) {
                        clipboardSequence = Native.GetClipboardSequenceNumber();
                        capturePhase = 2; captureDeadline = now.AddMilliseconds(1800);
                        try { SendKeys.SendWait("^%c"); } // One advanced-copy gesture; retain affix tiers and flags.
                        catch { capturePhase = 0; DisplayError("无法高级复制装备。请手动 Ctrl+Alt+C 后在工坊粘贴。"); }
                    }
                } else if (Native.GetClipboardSequenceNumber() != clipboardSequence) {
                    try {
                        string raw = Clipboard.ContainsText() ? Clipboard.GetText(TextDataFormat.UnicodeText) : "";
                        if (!String.IsNullOrEmpty(raw)) { capturePhase = 0; Submit(raw); }
                        else if (now > captureDeadline) { capturePhase = 0; DisplayError("复制内容不是装备文字。请将鼠标指向装备后重试。"); }
                    } catch (ExternalException) {
                        if (now > captureDeadline) { capturePhase = 0; DisplayError("剪贴板持续被占用，请稍后重试。"); }
                    }
                } else if (now > captureDeadline) {
                    capturePhase = 0; DisplayError("没有读到新的装备文字。请确认鼠标指向装备；也可手动 Ctrl+Alt+C 高级复制，在工坊粘贴。");
                }
            }
            if (postClient != null && now > postDeadline) {
                generation++; postClient.CancelAsync(); postClient.Dispose(); postClient = null;
                DisplayError("本地工坊没有及时响应。请检查工坊是否已启动，然后重新使用快捷键。");
            }
            if (pollClient != null && now > pollDeadline) { pollClient.CancelAsync(); pollClient.Dispose(); pollClient = null; nextPoll = now.AddSeconds(2); }
            if (resultId != null && now > resultDeadline) {
                resultId = null;
                panel.Display("请在工坊查看", "等待计算结果已超时。点击“在工坊查看”，确认网页已打开、装备已导入。", itemSummary);
            } else if (resultId != null && pollClient == null && now >= nextPoll) Poll();
        }

        private void Submit(string raw) {
            if (!Program.IsEquipmentText(raw)) {
                DisplayError("未读到完整物品文字。请指向物品后重试；支持装备、地图、宝石、通货及材料，不要求必须带物品等级。"); return;
            }
            capturedRaw = raw;
            panel.SetSnapshot(raw);
            string[] lines = raw.Replace("\r", "").Split('\n');
            List<string> names = new List<string>();
            for (int index = 0; index < Math.Min(lines.Length, 7); index++) {
                if (index > 1 && lines[index].Trim().Length > 0 && !lines[index].StartsWith("---")) names.Add(lines[index].Trim());
                if (lines[index].StartsWith("---")) break;
            }
            itemSummary = String.Join(" · ", names.ToArray());
            panel.Display("已保存物品快照 · 可以移开鼠标", "正在发送至工坊。请保持本地工坊页面打开，结果会自动更新。", itemSummary);
            int requestGeneration = generation;
            LocalClient client = new LocalClient(); postClient = client; postDeadline = DateTime.UtcNow.AddSeconds(6);
            client.Headers[HttpRequestHeader.ContentType] = "application/json; charset=utf-8";
            client.UploadStringCompleted += delegate(object sender, UploadStringCompletedEventArgs response) {
                if (requestGeneration != generation || disposed) { client.Dispose(); return; }
                postClient = null; client.Dispose();
                if (response.Cancelled || response.Error != null) {
                    WebException connectionError = response.Error as WebException;
                    HttpWebResponse rejected = connectionError == null ? null : connectionError.Response as HttpWebResponse;
                    DisplayError(rejected == null
                        ? "本地工坊服务没有响应。点击“在工坊查看”会启动后台服务；网页打开后请重新查价。也可运行 start-workbench.cmd。"
                        : "工坊拒绝了这次请求（HTTP " + (int)rejected.StatusCode + "）。请在工坊检查装备文本，或稍后重试。"); return;
                }
                try {
                    Dictionary<string, object> payload = json.Deserialize<Dictionary<string, object>>(response.Result);
                    string id = Text(payload, "id");
                    if (!payload.ContainsKey("ok") || !Object.Equals(payload["ok"], true) || String.IsNullOrEmpty(id)) throw new Exception();
                    resultId = id; nextPoll = DateTime.UtcNow; resultDeadline = nextPoll.AddMinutes(3);
                    panel.Display("已保存物品快照 · 可以移开鼠标", mode == "trade" ? "等待网页生成查价条件和挂牌参考。可展开下方“物品原文”核对；工坊未打开时请点“在工坊查看”。" : "等待网页核对制作锚点。工坊未打开时请点“在工坊查看”。", itemSummary);
                } catch { DisplayError("本地工坊返回了无效响应，请刷新网页后重试。"); }
            };
            try { client.UploadStringAsync(new Uri(origin + "/api/workbench/clipboard"), "POST", json.Serialize(new { raw = raw, mode = mode })); }
            catch { postClient = null; client.Dispose(); DisplayError("无法发送至本地工坊，请确认 start-workbench.cmd 正在运行。"); }
        }

        private void Poll() {
            string expectedId = resultId; int requestGeneration = generation;
            LocalClient client = new LocalClient(); pollClient = client; pollDeadline = DateTime.UtcNow.AddSeconds(5);
            nextPoll = DateTime.UtcNow.AddSeconds(1);
            client.DownloadStringCompleted += delegate(object sender, DownloadStringCompletedEventArgs response) {
                if (requestGeneration != generation || disposed || !Object.ReferenceEquals(pollClient, client)) { client.Dispose(); return; }
                pollClient = null; client.Dispose();
                if (response.Cancelled || response.Error != null || resultId != expectedId) return;
                try {
                    Dictionary<string, object> payload = json.Deserialize<Dictionary<string, object>>(response.Result);
                    string status = Text(payload, "status"), message = Text(payload, "message"), detail = Text(payload, "detail");
                    string candidate = Text(payload, "url");
                    if (!String.IsNullOrEmpty(candidate) && SafeUrl(candidate)) { resultUrl = candidate; panel.OpenResult.Enabled = true; }
                    if (!String.IsNullOrEmpty(message)) panel.Display(message, detail, itemSummary);
                    if (status == "ready" || status == "complete" || status == "error") resultId = null;
                } catch { /* An in-flight page refresh may momentarily return no result. */ }
            };
            try { client.DownloadStringAsync(new Uri(origin + "/api/workbench/companion-result?id=" + Uri.EscapeDataString(expectedId))); }
            catch { pollClient = null; client.Dispose(); }
        }

        private static string Text(Dictionary<string, object> payload, string key) {
            object value; return payload.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : "";
        }
        private bool SafeUrl(string url) { return Program.IsAllowedResultUrl(origin, url); }
        private void OpenWorkbench() {
            if (launcher != null || viewClient != null) return;
            if (capturePhase != 0) { panel.Display("正在读取装备…", "请等装备复制完成后，再点击“在工坊查看”。", itemSummary); return; }
            if (!File.Exists(launcherPath)) { OpenCapturedItem(); return; }
            try {
                ProcessStartInfo launch = new ProcessStartInfo("powershell.exe",
                    "-NoProfile -ExecutionPolicy Bypass -File \"" + launcherPath + "\" -NoHotkeys -NoBrowser -BaseUrl \"" + origin + "\"") {
                    UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
                };
                launcher = Process.Start(launch); launchDeadline = DateTime.UtcNow.AddSeconds(40);
                panel.Display("正在连接工坊", "正在检查并启动后台服务，就绪后会自动打开本次装备的页面，无需重新复制。", itemSummary);
            } catch { DisplayError("无法启动工坊，请手动运行 start-workbench.cmd。"); }
        }
        private void OpenCapturedItem() {
            if (String.IsNullOrEmpty(capturedRaw)) { OpenUrl(origin + "/?companion=1&lang=" + Uri.EscapeDataString(OverlayLocale.Language)); return; }
            // Retain the captured item across connection failures. A view is not a
            // new live task, so it cannot replay a completed crafting checkpoint.
            int requestGeneration = generation;
            LocalClient client = new LocalClient(); viewClient = client; viewDeadline = DateTime.UtcNow.AddSeconds(6);
            client.Headers[HttpRequestHeader.ContentType] = "application/json; charset=utf-8";
            client.UploadStringCompleted += delegate(object sender, UploadStringCompletedEventArgs response) {
                if (requestGeneration != generation || disposed || !Object.ReferenceEquals(viewClient, client)) { client.Dispose(); return; }
                viewClient = null; client.Dispose();
                if (response.Cancelled || response.Error != null) {
                    DisplayError("无法把本次装备送入工坊。已保留装备，请重新点击“在工坊查看”。"); return;
                }
                try {
                    Dictionary<string, object> payload = json.Deserialize<Dictionary<string, object>>(response.Result);
                    string id = Text(payload, "id");
                    if (!Object.Equals(payload["ok"], true) || String.IsNullOrEmpty(id)) throw new Exception();
                    resultId = mode == "trade" ? id : null;
                    nextPoll = DateTime.UtcNow.AddSeconds(1);
                    resultDeadline = nextPoll.AddMinutes(3);
                    OpenUrl(origin + "/?companion=1&equipment=" + Uri.EscapeDataString(id) + "&lang=" + Uri.EscapeDataString(OverlayLocale.Language));
                    panel.Display("已在工坊打开该装备", mode == "trade" ? "正在查询本次物品的挂牌参考，结果和官方市场链接会自动回到此面板。也可在网页调整条件。" : "浏览器已打开本次装备的页面，保留原制作锚点核对结果。", itemSummary);
                } catch { DisplayError("工坊返回的装备链接无效，请重试。"); }
            };
            try { client.UploadStringAsync(new Uri(origin + "/api/workbench/companion-view"), "POST", json.Serialize(new { raw = capturedRaw, mode = mode })); }
            catch { viewClient = null; client.Dispose(); DisplayError("无法打开装备页面，请重新点击“在工坊查看”。"); }
        }
        private void OpenUrl(string url) {
            if (!SafeUrl(url)) return;
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch { DisplayError("无法打开浏览器，请手动访问 " + origin); }
        }
        private void DisplayError(string detail) { panel.Display("需要检查", detail, itemSummary); }
        private void CancelRequests() {
            if (postClient != null) { postClient.CancelAsync(); postClient.Dispose(); postClient = null; }
            if (pollClient != null) { pollClient.CancelAsync(); pollClient.Dispose(); pollClient = null; }
            if (viewClient != null) { viewClient.CancelAsync(); viewClient.Dispose(); viewClient = null; }
        }
        protected override void ExitThreadCore() {
            disposed = true; timer.Stop(); timer.Dispose(); CancelRequests();
            if (launcher != null) { launcher.Dispose(); launcher = null; }
            if (localeClient != null) { localeClient.CancelAsync(); localeClient.Dispose(); localeClient = null; }
            tray.Visible = false; tray.Dispose(); window.Dispose(); panel.Dispose();
            base.ExitThreadCore();
        }
    }

    public static class Program {
        public static void ValidateLocales() {
            string original = OverlayLocale.Language;
            try {
                using (StatusPanel panel = new StatusPanel()) {
                    const string raw = "稀有度: 魔法\r\n終極魔力藥劑\r\n--------\r\n物品等級: 65";
                    panel.SetSnapshot(raw);
                    panel.Display("已在工坊打开该装备", "低价样本参考 1.5–2.5 崇高石", "終極魔力藥劑", false);
                    foreach (string language in new string[] { "en", "ja", "zh-CN" }) {
                        OverlayLocale.SetLanguage(language); panel.ApplyLocale();
                        if (panel.OpenWorkbench.Text != OverlayLocale.T("在工坊查看") || panel.Heading.Text != OverlayLocale.T("已在工坊打开该装备") || panel.Snapshot.Text != raw || panel.Item.Text != "終極魔力藥劑")
                            throw new InvalidOperationException("Overlay language update lost control text or the item snapshot.");
                        if (language == "en" && panel.Description.Text != "Low-price sample 1.5–2.5 Exalted Orb") throw new InvalidOperationException("English price summary was not translated: " + panel.Description.Text);
                        if (language == "ja" && panel.Description.Text != "低価格帯の出品参考 1.5–2.5 高貴なオーブ") throw new InvalidOperationException("Japanese price summary was not translated: " + panel.Description.Text);
                        if (language == "zh-CN" && panel.Description.Text != "低价样本参考 1.5–2.5 崇高石") throw new InvalidOperationException("Switching back to Chinese lost the original summary.");
                        panel.ToggleSnapshot(); panel.ToggleSnapshot();
                    }
                    OverlayLocale.SetLanguage("en");
                    if (OverlayLocale.T("工坊拒绝了这次请求（HTTP 429）。请在工坊检查装备文本，或稍后重试。").Contains("工坊")) throw new InvalidOperationException("HTTP error localization failed.");
                    if (panel.Visible) throw new InvalidOperationException("Validation unexpectedly showed the overlay.");
                }
            } finally { OverlayLocale.SetLanguage(original); }
        }
        public static void ValidateStatusPanel(string previewPath) {
            // Construct without Show(): no game input, network calls or preference writes.
            using (StatusPanel panel = new StatusPanel()) {
                if (panel.Opacity < 0.7 || panel.Opacity > 1 || panel.ShowInTaskbar || !panel.TopMost)
                    throw new InvalidOperationException("Overlay opacity / window configuration is invalid.");
                panel.Transparency.Value = 75;
                if (Math.Abs(panel.Opacity - 0.75) > 0.001) throw new InvalidOperationException("Opacity control did not update the panel.");
                panel.Transparency.Value = 100;
                if (panel.Opacity != 1) throw new InvalidOperationException("Opaque mode is unavailable.");
                const string raw = "Rarity: Rare\r\nSaved Item\r\nGold Ring\r\n--------\r\n+30% to Cold Resistance";
                panel.SetSnapshot(raw); panel.Heading.Text = "Result updated";
                int collapsedHeight = panel.ClientSize.Height;
                panel.ToggleSnapshot();
                if (panel.ClientSize.Height <= collapsedHeight || panel.Snapshot.Text != raw)
                    throw new InvalidOperationException("Snapshot expansion lost the captured item.");
                panel.ToggleSnapshot();
                if (panel.ClientSize.Height >= panel.Snapshot.Bottom || panel.Snapshot.Text != raw)
                    throw new InvalidOperationException("Collapsing the snapshot discarded item text.");
                panel.Scale(new SizeF(1.5F, 1.5F)); panel.ToggleSnapshot();
                if (panel.ClientSize.Height <= panel.Snapshot.Bottom)
                    throw new InvalidOperationException("Expanded snapshot is clipped at high DPI.");
                if (panel.Visible) throw new InvalidOperationException("Validation unexpectedly showed a window.");
            }
            if (!String.IsNullOrEmpty(previewPath)) {
                using (StatusPanel preview = new StatusPanel()) {
                    preview.Display("暂未识别物品 · 请在工坊核对", "本次物品快照已保留。可展开“物品原文”核对，或在工坊调整条件。复制成功后无需继续悬停。", "换界石（阶级 7）", false);
                    preview.SetSnapshot("物品種類: 換界石\r\n稀有度: 普通\r\n換界石（階級 7）\r\n--------\r\n換界石階級: 7");
                    preview.CreateControl();
                    using (Bitmap bitmap = new Bitmap(preview.Width, preview.Height)) {
                        preview.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
                        // A hidden form omits its child controls in DrawToBitmap. Render
                        // them individually so validation never has to show a window.
                        using (Graphics graphics = Graphics.FromImage(bitmap)) {
                            foreach (Control control in preview.Controls) {
                                if (Object.ReferenceEquals(control, preview.Snapshot)) continue;
                                using (Bitmap child = new Bitmap(control.Width, control.Height)) {
                                    control.DrawToBitmap(child, new Rectangle(Point.Empty, child.Size));
                                    graphics.DrawImageUnscaled(child, control.Location);
                                }
                            }
                        }
                        bitmap.Save(previewPath, System.Drawing.Imaging.ImageFormat.Png);
                    }
                }
            }
        }
        // These pure helpers are also used for validation without any game input.
        public static bool IsSupportedGameProcess(string name) {
            return !String.IsNullOrEmpty(name) && name.StartsWith("PathOfExile", StringComparison.OrdinalIgnoreCase);
        }
        public static bool IsEquipmentText(string raw) {
            return !String.IsNullOrEmpty(raw) && Encoding.UTF8.GetByteCount(raw) <= 60000 &&
                Regex.IsMatch(raw, @"(?im)^\s*(Rarity|稀有度)\s*[:：]") &&
                Regex.IsMatch(raw, @"(?m)^\s*-{3,}\s*$") &&
                Regex.IsMatch(raw, @"(?im)^\s*(Rarity|稀有度)\s*[:：][^\r\n]+\r?\n[^\r\n-]+");
        }
        public static bool IsAllowedResultUrl(string origin, string url) {
            Uri uri;
            if (!Uri.TryCreate(url, UriKind.Absolute, out uri) || !String.IsNullOrEmpty(uri.UserInfo)) return false;
            return (uri.Scheme == "https" && uri.Host == "www.pathofexile.com" && uri.IsDefaultPort) ||
                (uri.Scheme == "http" && uri.GetLeftPart(UriPartial.Authority) == origin);
        }
        [STAThread]
        public static void Run(string baseUrl, string startupScript) {
            bool created;
            using (Mutex mutex = new Mutex(false, @"Local\PoE2CraftWorkbenchHotkeys", out created)) {
                if (!created) return;
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                using (CompanionContext context = new CompanionContext(baseUrl, startupScript)) { Application.Run(context); }
            }
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $companionCode -Language CSharp -ReferencedAssemblies @(
        'System.Windows.Forms', 'System.Drawing', 'System.Web.Extensions', 'System.Core'
    )
    [PoE2WorkbenchHotkeys.OverlayLocale]::Initialize((Join-Path $PSScriptRoot 'workbench-hotkeys.i18n.json'), (Join-Path $PSScriptRoot '..\logs\companion-locale.json'))
    if ($ValidateOnly) {
        Write-Output 'Hotkey companion compiled successfully; no hotkeys registered or input sent.'
        return
    }
    [PoE2WorkbenchHotkeys.Program]::Run($workbenchUri.GetLeftPart([UriPartial]::Authority), (Join-Path $PSScriptRoot 'start-workbench.ps1'))
} catch {
    if ($ValidateOnly) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
        ([PoE2WorkbenchHotkeys.OverlayLocale]::T("快捷键助手启动失败：") + "`r`n" + [PoE2WorkbenchHotkeys.OverlayLocale]::T($_.Exception.Message)),
        ([PoE2WorkbenchHotkeys.OverlayLocale]::T('PoE2 做装工坊')),
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}
