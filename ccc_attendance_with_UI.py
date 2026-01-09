import qrcode
import tkinter as tk
from tkinter import ttk, messagebox
import datetime
import webbrowser
from PIL import ImageTk, Image

def datetime_to_timestamp(year, month, day, hour, minute):
    dt = datetime.datetime(year, month, day, hour, minute)
    return int(dt.timestamp() * 1000)

def generate_attendance_url(schedule_id, mode="auto", manual_time=None):
    if mode == "manual" and manual_time:
        ts = datetime_to_timestamp(*manual_time)
    else:
        ts = int(datetime.datetime.now().timestamp() * 1000 + 60000)
    return f"https://ccc.nottingham.edu.cn/study/attendance?scheduleId={schedule_id}&time={ts}"

def make_qr_image(url):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=8,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    return qr.make_image(fill_color="white", back_color="#10263B")

class QRGeneratorApp:
    def __init__(self, root):
        self.root = root
        root.title("UNNC中国文化课签到二维码生成器")
        window_width = 720
        window_height = 1000
        root.update_idletasks()
        screen_width = root.winfo_screenwidth()
        screen_height = root.winfo_screenheight()
        center_x = int((screen_width - window_width) / 2)
        center_y = int((screen_height - window_height) / 2)
        root.geometry(f"{window_width}x{window_height}+{center_x}+{center_y}")
        root.minsize(600, 800)
        root.resizable(True, True)
        root.configure(bg="#faf6ef")
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure("App.TFrame", background="#faf6ef")
        style.configure("Card.TFrame", background="#ffffff")
        style.configure("TLabel", padding=4, font=("Segoe UI", 11))
        style.configure(
            "Card.TLabel",
            background="#ffffff",
            foreground="#10263B",
            padding=4,
            font=("Segoe UI", 12, "bold"),
        )
        style.configure(
            "Card.TRadiobutton",
            background="#ffffff",
            foreground="#10263B",
            padding=4,
            font=("Segoe UI", 11),
        )
        style.configure("App.TEntry", fieldbackground="#ffffff")
        style.configure(
            "Theme.TButton",
            background="#10263B",
            foreground="#ffffff",
            padding=8,
            font=("Segoe UI", 12),
        )
        style.map("Theme.TButton", background=[["active", "#0d1f2f"]])

        header_frame = tk.Frame(root, bg="#faf6ef")
        header_frame.pack(fill="x", pady=(20, 10))
        
        try:
            logo_img = Image.open("public/ccc.webp")
            aspect_ratio = logo_img.width / logo_img.height
            new_height = 100
            new_width = int(new_height * aspect_ratio)
            logo_img = logo_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            self.logo_photo = ImageTk.PhotoImage(logo_img)
            logo_label = tk.Label(header_frame, image=self.logo_photo, bg="#faf6ef")
            logo_label.pack()
        except Exception as e:
            print(f"无法加载 Logo: {e}")

        title_label = tk.Label(
            header_frame, 
            text="UNNC中国文化课签到二维码生成器",
            font=("Segoe UI", 16, "bold"),
            bg="#faf6ef",
            fg="#10263B"
        )
        title_label.pack(pady=(10, 0))

        instruction = (
            "- 仅限 eduroam / UNNC-living / UNNC_IPSec VPN 环境使用\n"
            "- 有答题选项时不要忘记答题\n"
            "- e.g.若日历下课时间为 20:00 ，则最佳签到时间窗口为 19:50-20:00\n"
            "- 使用步骤详见 教程"
        )
        note_frame = tk.Frame(
            root,
            bg="#d7f0ef",
            highlightbackground="#37B4B0",
            highlightthickness=1,
            bd=0,
        )
        note_label = tk.Label(
            note_frame,
            text=instruction,
            justify="left",
            anchor="w",
            bg="#d7f0ef",
            fg="#10263B",
            padx=10,
            pady=8,
            wraplength=600,
        )
        note_label.pack(fill="x")
        link_label = tk.Label(
            note_frame, text="教程", bg="#d7f0ef", fg="#37B4B0", cursor="hand2"
        )
        link_label.pack(anchor="w", padx=10, pady=(0, 8))
        link_label.bind(
            "<Button-1>",
            lambda e: webbrowser.open(
                "https://github.com/byronwang2005/CCC-Attendance-QRcode-Generator/tree/main?tab=readme-ov-file#%E5%A6%82%E4%BD%95%E4%BD%BF%E7%94%A8"
            ),
        )
        note_frame.pack(fill="x", padx=15, pady=(10, 10))

        main_frame = tk.Frame(root, bg="#faf6ef")
        main_frame.pack(fill="both", expand=True, padx=20)

        link_card = tk.Frame(
            main_frame,
            bg="#ffffff",
            highlightbackground="#cfd4d8",
            highlightthickness=1,
            bd=0,
        )
        tk.Label(
            link_card,
            text="课程详情链接",
            bg="#ffffff",
            fg="#10263B",
            font=("Segoe UI", 12, "bold"),
        ).pack(anchor="w")
        self.url_entry = tk.Entry(
            link_card,
            width=80,
            relief="solid",
            bd=1,
            highlightthickness=2,
            highlightbackground="#cfd4d8",
            highlightcolor="#37B4B0",
        )
        self.url_entry.pack(pady=(8, 0), fill="x")
        self.url_entry.bind(
            "<FocusIn>",
            lambda e: (
                self.url_entry.selection_range(0, "end"),
                self.url_entry.config(
                    highlightbackground="#37B4B0", highlightcolor="#37B4B0"
                ),
            ),
        )
        self.url_entry.bind(
            "<FocusOut>", lambda e: self.url_entry.config(highlightbackground="#cfd4d8")
        )
        self.url_entry.focus_set()
        link_card.pack(fill="x", pady=12)

        self.mode = tk.StringVar(value="auto")
        mode_card = tk.Frame(
            main_frame,
            bg="#ffffff",
            highlightbackground="#cfd4d8",
            highlightthickness=1,
            bd=0,
        )
        tk.Label(
            mode_card,
            text="时间模式",
            bg="#ffffff",
            fg="#10263B",
            font=("Segoe UI", 12, "bold"),
        ).pack(anchor="w")
        mode_frame = tk.Frame(mode_card, bg="#ffffff")
        mode_frame.pack(pady=(4, 0))
        ttk.Radiobutton(
            mode_frame,
            text="自动",
            variable=self.mode,
            value="auto",
            command=self.toggle_time_input,
            style="Card.TRadiobutton",
        ).pack(side=tk.LEFT, padx=15)
        ttk.Radiobutton(
            mode_frame,
            text="手动",
            variable=self.mode,
            value="manual",
            command=self.toggle_time_input,
            style="Card.TRadiobutton",
        ).pack(side=tk.LEFT, padx=15)
        self.time_frame = tk.Frame(mode_card, bg="#ffffff")
        mode_card.pack(fill="x", pady=12)

        labels = ["年:", "月:", "日:", "时:", "分:"]
        now = datetime.datetime.now()
        defaults = [now.year, now.month, now.day, now.hour, now.minute]
        self.entries = []
        for i, (lbl, default) in enumerate(zip(labels, defaults)):
            row = i // 3
            col = (i % 3) * 2
            tk.Label(self.time_frame, text=lbl, bg="#ffffff", fg="#10263B").grid(
                row=row, column=col, padx=2, pady=4
            )
            width = 5 if "年" in lbl else 4
            entry = ttk.Entry(
                self.time_frame, width=width, justify="center", style="App.TEntry"
            )
            entry.insert(0, str(default))
            entry.grid(row=row, column=col + 1, padx=2, pady=4)
            self.entries.append(entry)

        self.generate_btn = ttk.Button(
            main_frame,
            text="生成签到二维码",
            command=self.generate_qr,
            style="Theme.TButton",
        )
        self.generate_btn.pack(pady=12, fill="x")

        qr_card = tk.Frame(
            root,
            bg="#ffffff",
            highlightbackground="#cfd4d8",
            highlightthickness=1,
            bd=0,
        )
        tk.Label(
            qr_card,
            text="二维码预览",
            bg="#ffffff",
            fg="#10263B",
            font=("Segoe UI", 12, "bold"),
        ).pack(anchor="w")
        self.qr_label = ttk.Label(qr_card)
        self.qr_label.pack(pady=8)
        qr_card.pack(fill="x", padx=20, pady=(5, 10))

    def toggle_time_input(self):
        if self.mode.get() == "manual":
            self.time_frame.pack(pady=8)
        else:
            self.time_frame.pack_forget()

    def generate_qr(self):
        url = self.url_entry.get().strip()
        if not url:
            messagebox.showwarning("输入为空", "请先粘贴课程链接！")
            self.url_entry.focus_set()
            return

        if "ccc.nottingham.edu.cn/study/home/details" not in url:
            messagebox.showerror("链接错误", "链接必须来自 UNNC 中国文化课详情页！")
            return

        try:
            schedule_id = None
            if "id=" in url:
                schedule_id = url.split("id=")[1].split("&")[0].split("#")[0]
            elif "scheduleId=" in url:
                schedule_id = url.split("scheduleId=")[1].split("&")[0].split("#")[0]

            if not schedule_id or schedule_id == "":
                raise ValueError("无法从链接中提取到有效的 id 或 scheduleId")

            if self.mode.get() == "manual":
                try:
                    manual_time = tuple(int(entry.get()) for entry in self.entries)
                    datetime.datetime(*manual_time)
                except (ValueError, TypeError, OverflowError):
                    messagebox.showerror(
                        "时间格式错误",
                        "请检查年月日时分是否填写正确（如：月≤12，日≤31，时<24）",
                    )
                    return
                attendance_url = generate_attendance_url(
                    schedule_id, mode="manual", manual_time=manual_time
                )
            else:
                attendance_url = generate_attendance_url(schedule_id)

            img = make_qr_image(attendance_url)
            self.qr_photo = ImageTk.PhotoImage(img)
            self.qr_label.configure(image=self.qr_photo)
            img.save("qrcode.png")
            messagebox.showinfo(
                "成功！",
                f"二维码已保存为当前目录下的 qrcode.png\n\n签到链接：\n{attendance_url}",
            )

        except Exception as e:
            messagebox.showerror("错误", f"生成失败：{str(e)}")

if __name__ == "__main__":
    root = tk.Tk()
    app = QRGeneratorApp(root)
    root.mainloop()
