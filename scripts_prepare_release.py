from __future__ import annotations

import json
from pathlib import Path
import zipfile
import sys

ROOT = Path(__file__).resolve().parent
EXT = ROOT / 'extension'
OUT_DIR = ROOT / 'dist'


def iter_release_files(manifest: dict) -> list[Path]:
    files = [
        EXT / 'popup.html',
        EXT / 'popup.js',
        EXT / 'popup.css'
    ]

    icon_paths = set()
    for key in ('icons',):
      icon_paths.update((manifest.get(key) or {}).values())
    action = manifest.get('action') or {}
    icon_paths.update((action.get('default_icon') or {}).values())

    for icon_path in sorted(icon_paths):
        files.append(EXT / icon_path)

    missing = [str(path.relative_to(ROOT)) for path in files if not path.is_file()]
    if missing:
        missing_list = ", ".join(missing)
        raise FileNotFoundError(f"Required release files are missing: {missing_list}")

    return files


def main() -> int:
    if len(sys.argv) != 2:
        print('Usage: python3 scripts_prepare_release.py <api_domain>')
        print('Example: python3 scripts_prepare_release.py api.politemessage.co.kr')
        return 1

    api_domain = sys.argv[1].strip()
    if not api_domain or '://' in api_domain or '/' in api_domain:
        print('api_domain must be a domain only (no scheme/path).')
        return 1

    manifest_path = EXT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['host_permissions'] = [f'https://{api_domain}/*']

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    release_manifest = OUT_DIR / 'manifest.release.json'
    release_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    zip_path = OUT_DIR / f'polite-message-extension-{api_domain}.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        for p in iter_release_files(manifest):
            zf.write(p, p.relative_to(EXT).as_posix())

    print(f'Release package created: {zip_path}')
    print(f'Release manifest preview: {release_manifest}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
