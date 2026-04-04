from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path('/home/dowon/securedir/git/codex/projects/260322_polite_message_extension')
OUT = ROOT / 'reports' / 'cws_assets'
OUT.mkdir(parents=True, exist_ok=True)

FONT_REG = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
FONT_BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
ICON = ROOT / 'extension' / 'icons' / 'icon-128.png'

COLORS = {
    'bg': '#f7f9fb',
    'panel': '#ffffff',
    'line': '#d7dbe7',
    'text': '#191c1e',
    'muted': '#57657a',
    'primary': '#093471',
    'primary2': '#294c8a',
    'blue_soft': '#eef2ff',
    'green_soft': '#e8f8ee',
    'red_soft': '#fff1f2',
    'shadow': '#dfe6f5',
    'coming': '#f2f5ff',
}


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def rr(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, s, size, fill, bold=False, anchor='la'):
    draw.text(xy, s, font=font(size, bold), fill=fill, anchor=anchor)


def fit_text(draw, box, s, size, fill, bold=False, line_gap=8):
    x1, y1, x2, y2 = box
    words = s.split()
    lines = []
    cur = ''
    f = font(size, bold)
    for w in words:
        trial = w if not cur else cur + ' ' + w
        if draw.textbbox((0,0), trial, font=f)[2] <= (x2 - x1):
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    y = y1
    for line in lines:
        draw.text((x1, y), line, font=f, fill=fill)
        y += size + line_gap
        if y > y2:
            break
    return y


def pill(draw, x, y, w, h, label, fill='#eef2ff', color='#213f83'):
    rr(draw, (x, y, x+w, y+h), h//2, fill=fill)
    text(draw, (x+w/2, y+h/2), label, 18, color, bold=True, anchor='mm')


def button(draw, x, y, w, h, label, primary=True):
    fill = COLORS['primary'] if primary else '#e7edfc'
    color = 'white' if primary else '#1f3f89'
    rr(draw, (x, y, x+w, y+h), 12, fill=fill)
    text(draw, (x+w/2, y+h/2), label, 20, color, bold=True, anchor='mm')


def input_box(draw, x, y, w, h, label, value='', muted=False):
    text(draw, (x, y-8), label, 18, COLORS['muted'], bold=True, anchor='ls')
    rr(draw, (x, y, x+w, y+h), 12, fill='white', outline=COLORS['line'])
    if value:
        fit_text(draw, (x+16, y+14, x+w-16, y+h-10), value, 19, '#79879d' if muted else COLORS['text'])


def draw_popup(draw, x, y, w=460, h=720):
    rr(draw, (x, y, x+w, y+h), 22, fill=(255,255,255,245), outline='#e4e7f1')
    text(draw, (x+24, y+36), 'Polite Rewriter', 28, COLORS['primary'], bold=True)
    # account card
    rr(draw, (x+16, y+70, x+w-16, y+165), 18, fill=COLORS['panel'], outline='#e4e7f1')
    text(draw, (x+30, y+96), '계정', 18, COLORS['muted'], bold=True)
    text(draw, (x+30, y+126), 'politemsg.support@gmail.com', 18, COLORS['text'])
    pill(draw, x+w-150, y+104, 110, 34, '로그인됨')
    button(draw, x+30, y+176, 130, 0, '', True)
    # plans card
    rr(draw, (x+16, y+182, x+w-16, y+290), 18, fill=COLORS['panel'], outline='#e4e7f1')
    text(draw, (x+30, y+208), '요금제', 18, COLORS['muted'], bold=True)
    text(draw, (x+30, y+236), '무료 사용 계정입니다.', 18, COLORS['muted'])
    rr(draw, (x+30, y+252, x+w-30, y+286), 12, fill=(17,27,45,110))
    text(draw, (x+w/2, y+269), '요금제 미리보기', 18, 'white', bold=True, anchor='mm')
    # form
    yy = y+314
    input_box(draw, x+24, yy+28, w-48, 46, '분위기', '정중하게')
    input_box(draw, x+24, yy+112, w-48, 46, '보내는 대상', '상사')
    input_box(draw, x+24, yy+196, w-48, 46, '본인 역할', '팀원')
    input_box(draw, x+24, yy+280, w-48, 120, '원본 문자', '오늘 회의 전에 보고 내용만 한 번 더 정리해서 보내주실 수 있을까요?', muted=True)
    button(draw, x+24, y+h-122, 180, 46, '메세지 다듬기', True)
    button(draw, x+214, y+h-122, 100, 46, '초기화', False)
    button(draw, x+324, y+h-122, 112, 46, '결과 복사', False)
    input_box(draw, x+24, y+h-66, w-48, 56, '변환 문자', '회의 전에 보고 내용을 한 번 더 정리해서 보내주실 수 있을까요?', muted=True)


def popup_canvas(size=(1280,800)):
    img = Image.new('RGBA', size, COLORS['bg'])
    draw = ImageDraw.Draw(img)
    # background
    draw.ellipse((-120,-120,420,340), fill='#dbe6ff')
    draw.ellipse((850,430,1380,980), fill='#edf3ff')
    # browser-like background
    rr(draw, (120,80,1160,720), 28, fill='#f4f7fd', outline='#dce4f5')
    for i,c in enumerate(['#ffb4a8','#ffe08a','#9fe3b1']):
        draw.ellipse((156+i*22, 104, 170+i*22, 118), fill=c)
    text(draw, (210,111), 'Chrome Extension Popup Preview', 20, COLORS['muted'], anchor='lm')
    draw_popup(draw, 410, 40, 460, 720)
    # side callout
    text(draw, (140,210), '감정적인 문장을', 30, COLORS['primary'], bold=True)
    text(draw, (140,250), '실제로 보내기 더 안전한 톤으로', 30, COLORS['primary'], bold=True)
    text(draw, (140,290), '빠르게 다듬는 한국어 확장 프로그램', 30, COLORS['primary'], bold=True)
    fit_text(draw, (140,350,360,520), 'Google 로그인 후 바로 사용하고, 분위기·대상·역할을 고르면 결과 문장을 바로 복사할 수 있습니다.', 20, COLORS['muted'])
    pill(draw, 140, 560, 120, 38, '보통')
    pill(draw, 270, 560, 120, 38, '정중하게')
    pill(draw, 140, 608, 120, 38, '캐주얼하게')
    pill(draw, 270, 608, 160, 38, '공손하지만 단호하게')
    return img.convert('RGB')


def draw_plan_card(draw, x, y, w, h, title, price, subtitle, lines, dim=False):
    rr(draw, (x,y,x+w,y+h), 22, fill='white', outline='#e2e7f2')
    text(draw, (x+26,y+40), title, 26, COLORS['text'], bold=True)
    text(draw, (x+26,y+72), subtitle, 18, COLORS['muted'])
    text(draw, (x+26,y+132), price, 44, COLORS['primary'], bold=True)
    yy = y+190
    for line in lines:
        draw.ellipse((x+26, yy+7, x+38, yy+19), fill=COLORS['primary'])
        text(draw, (x+50, yy+16), line, 19, COLORS['text'], anchor='lm')
        yy += 40
    button(draw, x+26, y+h-70, w-52, 44, '플랜 시작하기', primary=True)
    if dim:
        rr(draw, (x+10,y+10,x+w-10,y+h-10), 18, fill=(17,27,45,110))
        text(draw, (x+w/2,y+h/2), '준비중', 34, 'white', bold=True, anchor='mm')


def landing_canvas(size=(1280,800)):
    img = Image.new('RGB', size, COLORS['bg'])
    draw = ImageDraw.Draw(img)
    # top nav
    rr(draw, (40,24,1240,92), 20, fill=(250,251,255), outline='#e5ebf6')
    text(draw, (72,60), 'Polite Message Rewriter', 28, COLORS['primary'], bold=True, anchor='lm')
    text(draw, (1190,60), '관리자용', 16, COLORS['muted'], anchor='rm')
    # hero
    text(draw, (640,150), '충전형, 구독형 Pro / Business 요금제 비교', 42, COLORS['primary'], bold=True, anchor='mm')
    fit_text(draw, (250,195,1030,270), '당신의 전문성을 더하는 정중한 메시지 작성. 사용량에 딱 맞는 합리적인 플랜을 선택하세요.', 22, COLORS['muted'])
    rr(draw, (110,282,1170,326), 18, fill=COLORS['coming'], outline='#dfe7fb')
    text(draw, (640,304), '현재는 무료 버전만 먼저 운영 중입니다. 유료 플랜과 추가 충전은 준비중입니다.', 18, COLORS['primary'], bold=True, anchor='mm')
    # cards
    draw_plan_card(draw, 90, 360, 320, 300, 'Pro', '3,900원', '짧은 메시지를 자주 다듬는 개인용', ['일 30회', '월 50회', '1회 최대 500자'], dim=True)
    draw_plan_card(draw, 450, 360, 320, 300, 'Business', '9,900원', '메일·제안서 같은 긴 문장용', ['월 300회', '1회 최대 2,000자', '업무형 프리셋'], dim=True)
    draw_plan_card(draw, 810, 360, 320, 300, '추가 10회', '1,000원', '현재 플랜 글자 수 제한 유지', ['필요할 때만 충전', '별도 일회성 지급', '현재 준비중'], dim=True)
    # contact board summary
    rr(draw, (80,690,1200,770), 18, fill='white', outline='#dfe5f0')
    text(draw, (110,715), '고객 문의 게시판', 22, COLORS['text'], bold=True)
    text(draw, (110,748), '로그인 문제, 추가 유형 요청, 충전 문의 등을 남길 수 있습니다. 문의 내용은 관리자 대시보드와 메일에 함께 저장됩니다.', 17, COLORS['muted'])
    return img


def landing_full_canvas(size=(1600,2200)):
    img = Image.new('RGB', size, COLORS['bg'])
    draw = ImageDraw.Draw(img)
    rr(draw, (60,36,1540,110), 20, fill='#fbfcff', outline='#e5ebf6')
    text(draw, (100,74), 'Polite Message Rewriter', 34, COLORS['primary'], bold=True, anchor='lm')
    text(draw, (1460,74), '관리자용', 18, COLORS['muted'], anchor='rm')
    text(draw, (800,200), '충전형, 구독형 Pro / Business 요금제 비교', 54, COLORS['primary'], bold=True, anchor='mm')
    fit_text(draw, (280,255,1320,340), '당신의 전문성을 더하는 정중한 메시지 작성. 사용량에 딱 맞는 합리적인 플랜을 선택하세요.', 28, COLORS['muted'])
    rr(draw, (160,372,1440,424), 18, fill=COLORS['coming'], outline='#dfe7fb')
    text(draw, (800,398), '현재는 무료 버전만 먼저 운영 중입니다. 유료 플랜과 10회 추가 충전은 준비중입니다.', 24, COLORS['primary'], bold=True, anchor='mm')
    draw_plan_card(draw, 120, 480, 400, 420, 'Pro', '3,900원', '짧은 메시지를 자주 다듬는 개인형', ['일 30회', '월 50회', '1회 최대 500자', '배경 설명 100자'], dim=True)
    draw_plan_card(draw, 600, 480, 400, 420, 'Business', '9,900원', '보고·제안서·메일용 긴 문장', ['월 300회', '1회 최대 2,000자', '업무형 프리셋', '배경 설명 100자'], dim=True)
    draw_plan_card(draw, 1080, 480, 400, 420, '추가 10회', '1,000원', '현재 플랜 글자 수 제한 유지', ['일회성 충전', '관리자 지급 가능', '준비중'], dim=True)
    # cancel section
    rr(draw, (180,980,1420,1170), 24, fill='white', outline='#e2e7f2')
    text(draw, (800,1038), '진짜로 해지하실 건가요?', 38, COLORS['primary'], bold=True, anchor='mm')
    fit_text(draw, (320,1080,1280,1150), '언제든 해지할 수 있고, 해지 후에도 다음 결제일 전까지는 현재 플랜을 유지합니다. 해지 후에도 언제든 다시 구독할 수 있어요.', 24, COLORS['muted'])
    # free tier guide table
    rr(draw, (180,1230,1420,1540), 24, fill='white', outline='#e2e7f2')
    text(draw, (800,1275), 'Free Tier 기간 안내', 36, COLORS['primary'], bold=True, anchor='mm')
    rows = [('일 제한','10회'),('월 제한','100회'),('1회 최대 글자','500자'),('배경 설명','포함'),('추가 충전','10회 / 1,000원')]
    y = 1335
    for k,v in rows:
        rr(draw, (250,y,1350,y+42), 12, fill='#f8faff', outline='#ebeff7')
        text(draw, (290,y+21), k, 22, COLORS['text'], bold=True, anchor='lm')
        text(draw, (1280,y+21), v, 22, COLORS['muted'], anchor='rm')
        y += 52
    # feedback board
    rr(draw, (180,1600,1420,2100), 24, fill='white', outline='#e2e7f2')
    text(draw, (240,1658), '고객 문의 게시판', 34, COLORS['text'], bold=True)
    input_box(draw, 240, 1720, 450, 54, '회신 이메일', 'politemsg.support@gmail.com')
    input_box(draw, 730, 1720, 450, 54, '문의 주제', '메시지 생성 문의')
    input_box(draw, 240, 1818, 940, 160, '문의 내용', '상사에게 보내는 메시지 톤이 너무 강하게 느껴집니다. 조금 더 부드럽게 다듬는 옵션이 필요합니다.')
    button(draw, 240, 2010, 220, 50, '문의 남기기', True)
    rr(draw, (490,2010,1180,2060), 12, fill=COLORS['green_soft'], outline='#cde8d7')
    text(draw, (835,2035), '문의 내용이 저장되었습니다. 순차적으로 답변드리겠습니다.', 22, '#21572f', bold=True, anchor='mm')
    return img


def small_promo():
    base = Image.new('RGB', (440,280), '#eef3ff')
    draw = ImageDraw.Draw(base)
    draw.rectangle((0,0,36,280), fill='white')
    draw.rectangle((404,0,440,280), fill='white')
    text(draw, (220,40), 'Polite Rewriter', 30, COLORS['primary'], bold=True, anchor='mm')
    text(draw, (220,76), '거친 문장을 더 안전한 톤으로', 18, COLORS['muted'], anchor='mm')
    popup = popup_canvas((900,700)).resize((250,156))
    base.paste(popup, (95,104))
    return base


def marquee():
    img = Image.new('RGB', (1400,560), COLORS['bg'])
    draw = ImageDraw.Draw(img)
    draw.ellipse((-100,-140,500,420), fill='#dbe6ff')
    draw.ellipse((940,220,1540,780), fill='#edf3ff')
    text(draw, (90,120), 'Polite Message Rewriter', 52, COLORS['primary'], bold=True)
    fit_text(draw, (90,190,620,330), '감정적인 한국어 메시지를 상황에 맞는 정중한 문장으로 빠르게 다듬는 Chrome 확장 프로그램', 28, COLORS['text'], bold=False, line_gap=10)
    pill(draw, 90, 370, 140, 42, 'Google 로그인')
    pill(draw, 246, 370, 140, 42, '메세지 다듬기')
    pill(draw, 402, 370, 160, 42, '고객 문의/답장')
    # right showcase area in white margins style
    rr(draw, (700,60,1320,500), 28, fill='white', outline='#e5ebf6')
    popup = popup_canvas((1000,700)).resize((360,252))
    landing = landing_canvas((1200,760)).resize((420,266))
    img.paste(landing, (770,92))
    img.paste(popup, (900,222))
    return img


def save(img, name):
    img.save(OUT / name, quality=95)


def main():
    save(popup_canvas(), 'cws_screenshot_popup_1280x800.png')
    save(landing_canvas(), 'cws_screenshot_landing_1280x800.png')
    save(landing_full_canvas(), 'landing_full_overview_1600x2200.png')
    save(small_promo(), 'cws_small_promo_tile_440x280.png')
    save(marquee(), 'cws_marquee_promo_tile_1400x560.png')

if __name__ == '__main__':
    main()
