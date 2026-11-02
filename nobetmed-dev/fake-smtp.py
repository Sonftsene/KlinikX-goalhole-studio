"""Test için sahte SMTP sunucusu: AUTH LOGIN kabul eder, gelen iletileri klasöre .eml olarak yazar.
Kullanım: python3 fake-smtp.py <port> <klasör> [kullanıcı] [şifre]"""
import socketserver, sys, os, base64, time, threading

PORT, OUT = int(sys.argv[1]), sys.argv[2]
USER = sys.argv[3] if len(sys.argv) > 3 else 'test@ornek.com'
PASS = sys.argv[4] if len(sys.argv) > 4 else 'gizli'
os.makedirs(OUT, exist_ok=True)
lock = threading.Lock()
counter = [0]

class H(socketserver.StreamRequestHandler):
    def send(self, s): self.wfile.write((s + '\r\n').encode()); self.wfile.flush()
    def handle(self):
        self.send('220 sahte-smtp hazir')
        rcpt, mfrom, authed = [], None, False
        while True:
            line = self.rfile.readline()
            if not line: return
            cmd = line.decode('utf-8', 'replace').strip()
            up = cmd.upper()
            if up.startswith('EHLO') or up.startswith('HELO'):
                self.wfile.write(b'250-sahte-smtp\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n'); self.wfile.flush()
            elif up == 'AUTH LOGIN':
                self.send('334 VXNlcm5hbWU6'); u = base64.b64decode(self.rfile.readline().strip()).decode()
                self.send('334 UGFzc3dvcmQ6'); p = base64.b64decode(self.rfile.readline().strip()).decode()
                if u == USER and p == PASS: authed = True; self.send('235 tamam')
                else: self.send('535 kimlik dogrulama basarisiz')
            elif up.startswith('MAIL FROM'):
                if not authed: self.send('530 once giris yapin'); continue
                mfrom = cmd[10:]; rcpt = []; self.send('250 ok')
            elif up.startswith('RCPT TO'):
                rcpt.append(cmd[8:].strip('<> ')); self.send('250 ok')
            elif up == 'DATA':
                self.send('354 veri gonderin')
                data = []
                while True:
                    l = self.rfile.readline()
                    if l in (b'.\r\n', b'.\n'): break
                    data.append(l[1:] if l.startswith(b'..') else l)
                with lock:
                    counter[0] += 1
                    for r in rcpt:
                        with open(os.path.join(OUT, f'{int(time.time()*1000)}-{counter[0]}-{r}.eml'), 'wb') as f: f.write(b''.join(data))
                self.send('250 kuyruga alindi')
            elif up == 'RSET': self.send('250 ok')
            elif up == 'QUIT': self.send('221 gule gule'); return
            else: self.send('502 desteklenmiyor')

class S(socketserver.ThreadingTCPServer): allow_reuse_address = True
S(('127.0.0.1', PORT), H).serve_forever()
