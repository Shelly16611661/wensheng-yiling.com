/* ============================================================
   內容設定檔 ── 這是唯一需要你手動修改的檔案
   ------------------------------------------------------------
   · 20 張婚紗照:把檔案放進 assets/,檔名 wedding-01.jpg ~ wedding-20.jpg
   · 每張照片可以寫一行手寫註記(caption),留空字串 '' 就不顯示
   · 想增加照片:直接在 photos 陣列後面多加幾行,書會自動長厚
   ============================================================ */
window.CONTENT = {
  father: { name: '吳文勝', birth: '1971.03.01' },
  mother: { name: '劉翊鈴', birth: '1982.04.05' },

  wedding: '2004-09-09',        // 結婚登記日(ISO 格式,程式用來算天數)
  weddingText: '2004.09.09',
  anniversaryYear: 2026,
  anniversaryText: '2026.09.09',
  years: 22,

  domain: 'wensheng-yiling.com',
  siteTitle: '文勝 · 翊鈴 — 相愛相守 22 年',

  bookTitle: '我們的一年,又一年',
  bookSubtitle: 'Twenty-Two Years',

  hero: {
    kicker: '22nd Wedding Anniversary',
    dedication: '給 吳文勝 與 劉翊鈴',
  },

  threshold: {
    photo: 'assets/wedding-01.jpg',          // 相框裡那張(會碎成花瓣)
    line: '玻璃碎了,時間開始翻頁。',
  },

  preface: [
    '這本書沒有作者。',
    '它是二十二年,一頁一頁,自己寫成的。',
  ],

  interlude: {
    title: '二十二年',
    // {days} 會自動換成結婚至今的天數
    lines: ['{days} 個日子。', '每一天,都是同一個選擇。'],
  },

  finale: {
    line: '這一頁,留給你們。',
    small: '第二十三年,從這裡開始。',
  },

  colophon: ['愛你們的孩子 敬上', 'wensheng-yiling.com'],

  spring: { line: '二十二年,二十二個春天。' },

  echo: {
    line1: '吳文勝 · 劉翊鈴 · 相愛相守22年',
    line2: '愛你們的孩子 敬上',
  },

  /* 20 張婚紗照 ─────────────────────────────────────────
     src:檔案路徑  caption:手寫註記(可留空)
     fit:'cover'(填滿,預設)或 'contain'(完整顯示,橫式照片建議用這個) */
  photos: [
    { src: 'assets/wedding-01.jpg', caption: '' },
    { src: 'assets/wedding-02.jpg', caption: '' },
    { src: 'assets/wedding-03.jpg', caption: '' },
    { src: 'assets/wedding-04.jpg', caption: '' },
    { src: 'assets/wedding-05.jpg', caption: '' },
    { src: 'assets/wedding-06.jpg', caption: '' },
    { src: 'assets/wedding-07.jpg', caption: '' },
    { src: 'assets/wedding-08.jpg', caption: '' },
    { src: 'assets/wedding-09.jpg', caption: '' },
    { src: 'assets/wedding-10.jpg', caption: '' },
    { src: 'assets/wedding-11.jpg', caption: '' },
    { src: 'assets/wedding-12.jpg', caption: '' },
    { src: 'assets/wedding-13.jpg', caption: '' },
    { src: 'assets/wedding-14.jpg', caption: '' },
    { src: 'assets/wedding-15.jpg', caption: '' },
    { src: 'assets/wedding-16.jpg', caption: '' },
    { src: 'assets/wedding-17.jpg', caption: '' },
    { src: 'assets/wedding-18.jpg', caption: '' },
    { src: 'assets/wedding-19.jpg', caption: '' },
    { src: 'assets/wedding-20.jpg', caption: '' },
  ],

  /* 幕④ 陶瓷人偶的顏色(呼應婚紗照的水藍) */
  figurines: {
    skin: '#F3E7DD',
    hair: '#2A2622',
    father: { coat: '#9FB9D2', trousers: '#F4F1EC', shirt: '#FBFAF7', tie: '#C9202A' },
    mother: { dress: '#DDE8F1', gloves: '#FBFAF7', ribbon: '#C9202A' },
  },
};
