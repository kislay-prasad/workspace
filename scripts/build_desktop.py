#!/usr/bin/env python3
"""Build LANChat desktop packages from the official Electron downloads (no npm needed).

  python scripts/build_desktop.py --platform win32            # -> dist/LANChat-windows-x64.zip
  python scripts/build_desktop.py --platform linux
  python scripts/build_desktop.py --platform darwin-arm64     # Apple silicon
  python scripts/build_desktop.py --platform darwin-x64       # Intel Mac
  python scripts/build_desktop.py --platform win32 --electron-zip path/to/electron-vX-win32-x64.zip

Electron is downloaded from github.com/electron/electron releases and checked against the SHA-256 list
published with that release. Output zips keep file permissions (needed on Linux/macOS).
"""
import argparse, hashlib, json, os, shutil, stat, sys, tempfile, urllib.request, zipfile

ELECTRON = '45.4.1'
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
NAMES = {'win32': ('win32-x64', 'LANChat-windows-x64'), 'linux': ('linux-x64', 'LANChat-linux-x64'), 'darwin-arm64': ('darwin-arm64', 'LANChat-mac-arm64'), 'darwin-x64': ('darwin-x64', 'LANChat-mac-intel')}
README = {
 'win32': """LANChat - private chat sessions for you and your friends. No accounts, no cloud.

START:  double-click LANChat.exe
  - "Windows protected your PC"? Right-click the .zip BEFORE unzipping > Properties > tick Unblock, or click More info > Run anyway.
  - Windows Firewall: tick "Private networks" > Allow access (so friends can reach you).
  - First launch opens the Sessions window: create a session (you are the host/admin) or join a friend's.
  - Friends without the app: Chat menu > Invite friends shows a QR code / address for any browser.
  - Everyone who asks to join waits for YOUR approval.
Your data lives in %APPDATA%\\LANChat. Closing the window keeps hosted sessions running in the tray; use Quit to stop.
""",
 'linux': """LANChat - private chat sessions for you and your friends.
START:  ./lanchat      (needs a desktop session; if it won't start, try ./lanchat --no-sandbox)
Your data lives in ~/.config/LANChat.   See README.md for details.
""",
 'darwin': """LANChat - private chat sessions for you and your friends.
START: open LANChat.app.  The app is not signed by Apple, so macOS may say it is damaged or from an unidentified developer:
  Terminal:  xattr -cr /path/to/LANChat.app     then open it again   (or right-click > Open).
Your data lives in ~/Library/Application Support/LANChat.
""",
}

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''): h.update(c)
    return h.hexdigest()

def download(url, dest):
    print('downloading', url); urllib.request.urlretrieve(url, dest)

def extract_with_perms(zpath, dest):
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            target = os.path.join(dest, info.filename)
            if not os.path.abspath(target).startswith(os.path.abspath(dest) + os.sep): raise SystemExit('unsafe path in zip: ' + info.filename)
            z.extract(info, dest)
            mode = info.external_attr >> 16
            if mode and not info.is_dir(): os.chmod(target, mode & 0o7777 or 0o644)
            if stat.S_ISLNK(mode):  # symlinks (macOS frameworks): recreate as real links
                link = z.read(info).decode(); os.remove(target); os.symlink(link, target)

def zip_dir(src, out, top):
    if os.path.exists(out): os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for root, dirs, files in os.walk(src):
            for name in dirs + files:
                p = os.path.join(root, name); arc = os.path.join(top, os.path.relpath(p, src))
                if os.path.islink(p):
                    zi = zipfile.ZipInfo(arc); zi.create_system = 3; zi.external_attr = (stat.S_IFLNK | 0o755) << 16; z.writestr(zi, os.readlink(p))
                elif os.path.isfile(p): z.write(p, arc)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--platform', required=True, choices=list(NAMES)); ap.add_argument('--electron-zip'); ap.add_argument('--out', default=os.path.join(ROOT, 'dist'))
    a = ap.parse_args(); plat, outname = NAMES[a.platform]; os.makedirs(a.out, exist_ok=True)
    work = tempfile.mkdtemp(prefix='lanchat-build-'); zpath = a.electron_zip
    try:
        fname = f'electron-v{ELECTRON}-{plat}.zip'
        if not zpath:
            base = f'https://github.com/electron/electron/releases/download/v{ELECTRON}'; zpath = os.path.join(work, fname); download(f'{base}/{fname}', zpath); sums = os.path.join(work, 'SHASUMS256.txt'); download(f'{base}/SHASUMS256.txt', sums)
            want = next(l.split()[0] for l in open(sums) if l.strip().endswith(fname)); got = sha256(zpath)
            if want != got: raise SystemExit(f'CHECKSUM MISMATCH for {fname}: expected {want}, got {got}')
            print('checksum ok', got)
        pkg = os.path.join(work, 'pkg'); os.makedirs(pkg); extract_with_perms(zpath, pkg)
        if a.platform == 'win32': os.rename(os.path.join(pkg, 'electron.exe'), os.path.join(pkg, 'LANChat.exe')); appdir = os.path.join(pkg, 'resources', 'app'); readme = README['win32']; rname = 'README - open LANChat.exe.txt'
        elif a.platform == 'linux': os.rename(os.path.join(pkg, 'electron'), os.path.join(pkg, 'lanchat')); appdir = os.path.join(pkg, 'resources', 'app'); readme = README['linux']; rname = 'README.txt'
        else: os.rename(os.path.join(pkg, 'Electron.app'), os.path.join(pkg, 'LANChat.app')); appdir = os.path.join(pkg, 'LANChat.app', 'Contents', 'Resources', 'app'); readme = README['darwin']; rname = 'README.txt'
        for junk in (os.path.join(os.path.dirname(appdir), 'default_app.asar'), os.path.join(pkg, 'version')):
            if os.path.exists(junk): os.remove(junk)
        os.makedirs(appdir)
        for f in os.listdir(os.path.join(ROOT, 'desktop')):
            if f.endswith(('.js', '.html', '.json')): shutil.copy(os.path.join(ROOT, 'desktop', f), appdir)
        for d in ('lib', 'public'): shutil.copytree(os.path.join(ROOT, d), os.path.join(appdir, d), ignore=shutil.ignore_patterns('*.test.js'))
        shutil.copy(os.path.join(ROOT, 'LICENSE-NOTICES.txt'), pkg) if os.path.exists(os.path.join(ROOT, 'LICENSE-NOTICES.txt')) else None
        open(os.path.join(pkg, rname), 'w', encoding='utf-8').write(readme)
        out = os.path.join(a.out, outname + '.zip'); zip_dir(pkg, out, 'LANChat'); print('built', out, round(os.path.getsize(out) / 1048576), 'MB')
    finally: shutil.rmtree(work, ignore_errors=True)

if __name__ == '__main__': main()
