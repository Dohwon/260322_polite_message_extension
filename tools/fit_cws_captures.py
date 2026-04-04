from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports" / "cws_assets"
OUT.mkdir(parents=True, exist_ok=True)

SRC = {
    "popup": OUT / "cws_screenshot_popup_actual_1280x800.png",
    "landing": OUT / "cws_screenshot_landing_actual_1280x800.png",
    "landing_full": OUT / "landing_full_actual.png",
}

WHITE = (255, 255, 255)


def fit_on_canvas(src_path: Path, canvas_size: tuple[int, int], out_name: str):
    with Image.open(src_path) as im:
        im = im.convert('RGB')
        sw, sh = im.size
        cw, ch = canvas_size
        scale = min(cw / sw, ch / sh)
        nw = max(1, int(sw * scale))
        nh = max(1, int(sh * scale))
        resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
        canvas = Image.new('RGB', (cw, ch), WHITE)
        x = (cw - nw) // 2
        y = (ch - nh) // 2
        canvas.paste(resized, (x, y))
        canvas.save(OUT / out_name, quality=95)


def main():
    # 일반 스크린샷
    fit_on_canvas(SRC["popup"], (1280, 800), "store_popup_1280x800.png")
    fit_on_canvas(SRC["landing"], (1280, 800), "store_landing_1280x800.png")
    fit_on_canvas(SRC["popup"], (640, 400), "store_popup_640x400.png")
    fit_on_canvas(SRC["landing"], (640, 400), "store_landing_640x400.png")

    # 전체 랜딩을 규격 캔버스에 맞춘 참고본
    fit_on_canvas(SRC["landing_full"], (1280, 800), "store_landing_full_1280x800.png")
    fit_on_canvas(SRC["landing_full"], (640, 400), "store_landing_full_640x400.png")

    # 프로모션 타일
    fit_on_canvas(SRC["popup"], (440, 280), "promo_small_from_popup_440x280.png")
    fit_on_canvas(SRC["landing"], (440, 280), "promo_small_from_landing_440x280.png")
    fit_on_canvas(SRC["landing"], (1400, 560), "promo_marquee_from_landing_1400x560.png")
    fit_on_canvas(SRC["popup"], (1400, 560), "promo_marquee_from_popup_1400x560.png")


if __name__ == "__main__":
    main()
