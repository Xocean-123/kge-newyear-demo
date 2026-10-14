(() => {
  'use strict';
  const users = { A: { name: '林屿', initial: '林' }, B: { name: '小满', initial: '满' } };
  const channels = { app: '全民 K 歌内', wechat: '微信', qq: 'QQ' };
  const packages = { basic: { name: '暖心信封', price: 0, symbol: '♡' }, fire: { name: 'AI 花火礼盒', price: 6.6, symbol: '✦' }, star: { name: 'AI 星河礼盒', price: 9.9, symbol: '☾' } };
  const songs = [
    { title: '下一站，晴天', genre: '温暖流行', lines: ['把今天的星光收进口袋', '明天的风会带着你向前', '下一站，晴天', '我们在新年的路口遇见'] },
    { title: '新年有你', genre: '轻快民谣', lines: ['十二点的钟声轻轻落下', '想说的话都写进这首歌', '新年有你陪着我', '每一天都有新的颜色'] },
    { title: '把愿望唱给你', genre: '治愈轻音乐', lines: ['把小小愿望藏进旋律', '让远方的你慢慢听见', '愿所有期待都有回应', '愿每个明天都值得纪念'] }
  ];
  const publishedWork = { title: '这世界那么多人', lines: ['把这份新年心意唱给你', '愿往后的日子有人同行', '每一次相聚都值得珍惜', '愿你的世界一直温柔明亮'] };
  const storeKey = 'new-year-song-gift-prototype-v1';
  const other = role => role === 'A' ? 'B' : 'A';
  const cash = value => Number(value || 0).toFixed(2);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const freshDraft = role => ({ mode: 'record', song: 0, workGift: false, recorded: false, recordedSeconds: 0, aiTier: 'free', aiReady: false, relationship: '好友', story: '一起看海的夏天', wish: '新的一年，也要一起走过很多好风景。', style: '温暖流行', aiTitle: `写给${users[other(role)].name}的2027`, aiLyrics: '', pack: 'basic', cardPrompt: '新年烟花、海边晚风', packageGenerated: false, cardVariant: 0, surprise: true, redEnabled: false, redAmount: '6.66', blessing: '新年快乐！愿你眼里有光，心里有歌。', replyText: '' });
  const freshState = () => ({ version: 1, channel: 'app', view: 'both', nextId: 1, pages: { A: 'home', B: 'inbox' }, drafts: { A: freshDraft('A'), B: freshDraft('B') }, selected: { A: null, B: null }, gifts: [] });
  let state = freshState();
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey));
    if (saved && saved.version === 1 && saved.drafts && saved.pages && Array.isArray(saved.gifts) && channels[saved.channel]) {
      state = saved;
      ['A', 'B'].forEach(r => { state.drafts[r] = { ...freshDraft(r), ...saved.drafts[r] }; if (state.pages[r] === 'generating') state.pages[r] = 'ai'; if (state.pages[r] === 'paying') state.pages[r] = 'send'; if (state.pages[r] === 'room') state.pages[r] = 'home'; });
    }
  } catch (_) { /* File previews can block browser storage. The prototype still works. */ }
  const demo = document.getElementById('demo');
  let toastTimer, record = null, playback = null, generationJobs = {}, payJobs = {}, paying = new Set(), opening = new Set();
  const errors = { A: '', B: '' };
  const save = () => { try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (_) {} };
  const titleOf = draft => draft.mode === 'ai' ? draft.aiTitle : draft.workGift ? publishedWork.title : songs[draft.song].title;
  const lyricsOf = draft => draft.mode === 'ai' ? draft.aiLyrics : (draft.workGift ? publishedWork.lines : songs[draft.song].lines).join('\n');
  const incoming = role => state.gifts.filter(g => g.to === role && g.channel === state.channel).slice().reverse();
  const outgoing = role => state.gifts.filter(g => g.from === role && g.channel === state.channel).slice().reverse();
  const selectedGift = role => state.gifts.find(g => g.id === state.selected[role]);
  const fee = d => (d.mode === 'ai' && d.aiTier === 'custom' ? 9.9 : 0) + packages[d.pack].price;
  const red = d => {
    if (state.channel === 'app' || !d.redEnabled) return 0;
    const n = Number(d.redAmount);
    return Number.isFinite(n) && n >= .01 && n <= 200 && Math.abs(n * 100 - Math.round(n * 100)) < .001 ? Math.round(n * 100) / 100 : 0;
  };
  const invalidRed = d => state.channel !== 'app' && d.redEnabled && red(d) === 0;
  const totalLabel = d => invalidRed(d) ? '待确认' : '¥' + cash(total(d));
  const sendLabel = d => total(d) > 0 || invalidRed(d) ? '确认订单并送出' : '免费送出歌曲礼物';
  const total = d => fee(d) + red(d);

  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message; el.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 2600);
  }
  const action = (name, label, className = 'primary', extra = '') => `<button type="button" class="${className}" data-action="${name}" ${extra}>${label}</button>`;
  const avatar = role => `<span class="avatar ${role === 'B' ? 'b' : ''}">${users[role].initial}</span>`;
  const errorMarkup = role => errors[role] ? `<p class="validation" role="alert">${esc(errors[role])}</p>` : '';
  const field = (label, key, value, type = 'text', extra = '') => `<label class="form-label">${label}<input class="form-input" data-field="${key}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const textarea = (label, key, value, max = 100) => `<label class="form-label">${label}<textarea class="form-textarea" data-field="${key}" maxlength="${max}">${esc(value)}</textarea></label>`;
  function nav(role, title, back = true, social = false) {
    return `<div class="app-nav ${social ? 'chat-header' : ''}">${back ? action('back', '‹', 'nav-icon', 'aria-label="返回上一页"') : '<span class="k-logo" style="width:25px;height:25px;font-size:19px">K</span>'}<span class="nav-title">${title}</span><span class="sub-brand">${social ? channels[state.channel] : '2027'}</span></div>`;
  }
  function tabIcon(name) {
    const paths = {
      feed: '<path d="M5 4.5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6.5a2 2 0 0 1 2-2Z"/><path d="M7.5 9h9"/>',
      sing: '<g transform="rotate(-42 12 12)" fill="currentColor" stroke="none"><rect x="6.5" y="2" width="11" height="13" rx="5.5"/><rect x="9.5" y="15.5" width="5" height="7" rx="2.5"/></g>',
      home: '<path d="m3 8 9-5 9 5v13H3Z"/>',
      inbox: '<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="m4 7 8 5 8-5"/>',
      outbox: '<circle cx="12" cy="7" r="4"/><path d="M3 20c0-4 3.5-6 9-6s9 2 9 6c0 1-18 1-18 0Z"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }
  function bottom(role, current) {
    const unread = incoming(role).filter(g => !g.opened).length;
    return `<nav class="bottom-tabs" aria-label="全民K歌底部导航">${[['feed', '动态'], ['home', '活动'], ['sing', '唱歌'], ['inbox', '消息'], ['outbox', '我的']].map(([page, label]) => {
      const sing = page === 'sing', active = current === page;
      return action(sing ? 'start-record' : 'nav', `<span class="tab-icon ${sing ? 'tab-mic' : ''}">${tabIcon(page)}${page === 'inbox' && unread ? `<b class="tab-badge">${unread > 99 ? '99+' : unread}</b>` : ''}</span><span class="tab-label">${label}</span>`, `bottom-tab ${active ? 'active' : ''} ${sing ? 'sing-tab' : ''}`, `data-page="${page}" aria-label="${label}${page === 'inbox' && unread ? `，${unread}份未拆礼物` : ''}" ${active ? 'aria-current="page"' : ''}`);
    }).join('')}</nav>`;
  }
  function frame(role, title, content, footer = '', options = {}) {
    return nav(role, title, options.back !== false, options.social) + `<div class="app-scroll ${options.className || ''}">${content}</div>` + (footer ? `<div class="page-footer">${footer}</div>` : '') + (options.bottom ? bottom(role, options.bottom) : '');
  }
  const giftArt = (pack = 'basic', opened = false) => `<div class="gift-art ${pack} ${opened ? 'opening' : ''}" aria-hidden="true"><div class="gift-bow"></div><div class="gift-bow second"></div><div class="gift-lid"></div><div class="gift-box"><span class="gift-mark">♪</span></div></div>`;
  function giftPreview(role, d, sealed = true) {
    const target = users[other(role)].name;
    return `<div class="gift-preview ${d.pack} card-v${d.cardVariant || 0}"><span class="decor-star one">✦</span><span class="decor-star two">✧</span><span class="decor-star three">✦</span><div class="to">TO ${esc(target)} · HAPPY 2027</div>${giftArt(d.pack)}<h3>${sealed && d.surprise ? '一首只送给你的歌' : esc(titleOf(d))}</h3><p data-live-blessing>${esc(d.blessing || '愿新年的第一份心意，刚好被你听见。')}</p>${d.pack !== 'basic' ? `<div class="pack-keywords">${esc(d.cardPrompt)} · ${['心意信封', '花火来信', '星光回声'][d.cardVariant || 0]}</div>` : ''}</div>`;
  }
  function musicPlayer(key, label = '原型示例伴奏 · 18 秒') {
    const active = playback && playback.key === key && !playback.paused;
    return `<div class="player" data-player="${key}">${action('play', active ? 'Ⅱ' : '▶', 'play-button', `data-key="${key}" aria-label="${active ? '暂停' : '播放'}示例伴奏"`)}<div class="player-track"><small>${label}</small><div class="track"><b data-track style="width:${active ? playback.seconds / 18 * 100 : 0}%"></b></div><div class="player-time"><span data-elapsed>${active ? '0:' + String(playback.seconds).padStart(2, '0') : '0:00'}</span><span>0:18</span></div></div></div>`;
  }
  function summary(d, detail = true) {
    return `<div class="summary">${detail ? `<div class="summary-row"><span>${d.mode === 'ai' ? (d.aiTier === 'custom' ? 'AI 专属故事创作' : 'AI 新年灵感创作') : '亲自录歌'}</span><span>¥${cash(d.mode === 'ai' && d.aiTier === 'custom' ? 9.9 : 0)}</span></div><div class="summary-row"><span>${packages[d.pack].name}</span><span>¥${cash(packages[d.pack].price)}</span></div>${red(d) > 0 ? `<div class="summary-row"><span>附赠红包 · 给收礼人</span><span>¥${cash(red(d))}</span></div>` : ''}` : ''}<div class="summary-row total"><span>合计${red(d) > 0 ? '（含红包）' : ''}</span><b data-total>${totalLabel(d)}</b></div></div>`;
  }

  function renderHome(role) {
    return frame(role, '活动', `<div class="event-list"><div class="event-list-heading"><span>2027 · NEW YEAR</span><h2>精选活动</h2><p>新年开唱，把第一份心意送出去</p></div>${action('open-event', '<span class="event-feature-spark one">✦</span><span class="event-feature-spark two">✧</span><span class="event-feature-top">2027 元旦限定 · 歌声礼物</span><span class="event-feature-record">♪</span><span class="event-feature-title">新年第一首歌</span><span class="event-feature-copy">亲自唱，或让 AI 写一首<br>把新年的心意送给 TA</span><span class="event-feature-cta">立即参与 <b>→</b></span>', 'event-card event-feature', 'aria-label="进入新年第一首歌活动"')}<div class="event-list-subhead"><strong>更多活动</strong><small>发现 K 歌里的精彩</small></div><article class="event-card event-contest" aria-label="创作者巅峰赛活动展示"><span class="contest-mascot" aria-hidden="true">♪</span><span class="contest-copy"><small>创作热情，声声向上</small><strong>创作者巅峰赛</strong><em>创作冲榜赢好礼 · 丰厚奖励等你拿</em><span class="poster-pill">点击参与</span></span><span class="poster-leaf one" aria-hidden="true">✦</span><span class="poster-leaf two" aria-hidden="true">✦</span></article><article class="event-card event-vip" aria-label="VIP 超级秒杀节活动展示"><span class="vip-sticker">全<br>民<br>K<br>歌</span><span class="vip-copy"><small>VIP · 限时福利</small><strong>VIP 超级秒杀节</strong><em>超值好礼 限时回归</em><span class="poster-pill">立即抢购</span></span><span class="vip-envelope" aria-hidden="true"><b>7天</b></span><span class="vip-coin one" aria-hidden="true">★</span><span class="vip-coin two" aria-hidden="true">★</span></article></div>`, '', { back: false, className: 'no-pad', bottom: 'home' });
  }
  function renderEvent(role) {
    return frame(role, '新年第一首歌', `<section class="hero"><div class="hero-kicker">2027 / NEW YEAR GIFT</div><h2>新年的第一首歌<br>想唱给你听</h2><p>亲自唱，或让 AI 写一首。<br>把说不出口的心意，装进歌里。</p><div class="hero-art" aria-hidden="true"><div class="vinyl"></div><div class="sleeve">♪</div></div>${action('choose', '制作我的歌曲礼物 ↗', 'hero-cta')}</section><div class="home-padded"><div class="section-title">这份心意，怎么表达？ <small>两种创作方式</small></div><div class="entry-grid">${action('start-record', '<span class="entry-icon">♩</span><strong>亲自唱一首</strong><small>你的声音，就是最好的礼物</small>', 'entry-card')}${action('start-ai', '<span class="entry-icon">✦</span><strong>AI 为你写歌</strong><small>把我们的故事，写进旋律</small>', 'entry-card ai')}</div><div class="activity-note"><span class="round-icon">✧</span><div><strong>拆开歌声，遇见一份惊喜</strong><p>歌名拆封后揭晓 · 可以送到微信和 QQ</p></div></div><div class="activity-note"><span class="round-icon">♡</span><div><strong>心意有来有回</strong><p>收到后，可以回复感谢或回赠一首歌</p></div></div></div>`, '', { className: 'no-pad' });
  }
  function renderChoose(role) {
    return frame(role, '制作新年歌曲礼物', `<div class="mini-heading">TO ${users[other(role)].name}</div><div class="music-card"><div class="album"><span>♡</span></div><h3>选一种方式，把心意唱出来</h3><p>亲自唱有温度，AI 创作有惊喜</p></div><div class="entry-grid">${action('start-record', '<span class="entry-icon">♩</span><strong>我来唱</strong><small>选一首歌，用自己的声音表达</small>', 'entry-card')}${action('start-ai', '<span class="entry-icon">✦</span><strong>AI 创作</strong><small>输入故事，定制一首新年祝福</small>', 'entry-card ai')}</div><p class="center-note">基础录歌与送礼免费<br>可按需选购 AI 创作和专属包装</p>`);
  }
  function renderFeed(role) {
    return frame(role, '动态', `<div class="section-title">好友动态 <small>新年新声</small></div><section class="nav-content-card"><div class="message-head">${avatar(other(role))}<div><strong>${users[other(role)].name}</strong><small>2027 年 1 月 1 日</small></div></div><h3>新年的第一首歌，想听你唱。</h3><p>愿新的一年，有喜欢的旋律，也有惦记的人。</p><div class="nav-song-cover">♪<small>新年有你 · 2027</small></div>${action('start-record', '唱一首，送给 TA', 'secondary')}</section>${action('nav', '<strong>元旦歌声礼物</strong><small>把新年祝福唱给重要的人 →</small>', 'nav-activity-entry', 'data-page="home"')}`, '', { back: false, className: 'soft', bottom: 'feed' });
  }
  function renderRecord(role) {
    const d = state.drafts[role], recording = record && record.role === role;
    return frame(role, '亲自唱一首', `<div class="progress-dots"><i class="done"></i><i></i><i></i></div><div class="section-title">挑一首，唱给 ${users[other(role)].name}<small>原创示例曲目</small></div>${songs.map((s, i) => action('song', `<span class="song-thumb">♪</span><span class="song-text"><strong>${s.title}</strong><small>${s.genre} · 新年歌单</small></span><span class="tick">${d.song === i ? '✓' : ''}</span>`, `song-option ${d.song === i ? 'selected' : ''}`, `data-index="${i}"`)).join('')}<div class="record-panel"><p class="lyric-line active">${songs[d.song].lines[0]}</p><p class="lyric-line">${songs[d.song].lines[1]}</p><div class="wave" aria-hidden="true">${[9, 17, 26, 14, 34, 42, 22, 36, 48, 31, 20, 38, 24, 13, 22, 9].map(h => `<i style="height:${h}px"></i>`).join('')}</div><div class="timer" data-record-timer>${recording ? formatTime(record.seconds) : formatTime(d.recordedSeconds)}</div>${action('record-toggle', recording ? '■' : (d.recorded ? '↻' : '●'), `record-button ${recording ? 'recording' : ''}`, `aria-label="${recording ? '结束录制' : d.recorded ? '重新录制' : '开始录制'}"`)}<p class="small-note">${recording ? '录制中，点击结束' : d.recorded ? '已保存本次演唱 · 可重新录制' : '点击开始演唱 · 演示录制'}</p></div>`, action('review-record', '试听并继续 →', 'primary', d.recorded && !recording ? '' : 'disabled'));
  }
  function renderAI(role) {
    const d = state.drafts[role];
    return frame(role, 'AI 为你写歌', `<div class="progress-dots"><i class="done"></i><i></i><i></i></div><div class="section-title">把你们的故事，写进歌里 <span class="chip purple">先试听</span></div><div class="recipient">${avatar(other(role))}<div><strong>写给 ${users[other(role)].name}</strong><small>一首歌，记住属于你们的瞬间</small></div></div><label class="form-label">你们的关系<select class="form-select" data-field="relationship">${['好友', '恋人', '家人', '同学'].map(v => `<option ${v === d.relationship ? 'selected' : ''}>${v}</option>`).join('')}</select></label>${textarea('想对 TA 说的话', 'wish', d.wish)}${field('一段共同的回忆', 'story', d.story, 'text', 'maxlength="50"')}<label class="form-label">歌曲风格</label><div class="options-row">${['温暖流行', '轻快民谣', '浪漫 R&B'].map(style => action('style', style, `option-pill ${d.style === style ? 'selected' : ''}`, `data-value="${style}"`)).join('')}</div><div class="ai-tier">${action('ai-tier', '<b>新年灵感</b>免费 · 祝福模板创作', d.aiTier === 'free' ? 'selected' : '', 'data-value="free"')}${action('ai-tier', '<b>专属故事 ¥9.90</b>将昵称与回忆写入歌词', d.aiTier === 'custom' ? 'selected' : '', 'data-value="custom"')}</div>${errorMarkup(role)}<p class="small-note">确认作品后再决定是否购买。此处为生成过程演示。</p>`, action('generate', d.aiReady ? '重新生成歌曲 ✦' : '生成我的新年歌曲 ✦'));
  }
  function renderGenerating(role) {
    return frame(role, '正在写下你的心意', `<div class="generation-box"><span class="spark">✦</span><h3>正在为 ${users[other(role)].name} 谱写新年</h3><p>整理你们的故事<br>写下专属歌词<br>让旋律慢慢生长</p><div class="loading-line"><i></i></div><div class="loading-dots"><span></span><span></span><span></span></div><p>一份新年心意，马上就好</p></div>`);
  }
  function renderReview(role) {
    const d = state.drafts[role];
    return frame(role, '听听这份新年心意', `<div class="progress-dots"><i class="done"></i><i class="done"></i><i></i></div><div class="music-card"><div class="album ${d.mode === 'ai' ? 'ai-album' : ''}"><span>♪</span></div><h3>${esc(titleOf(d))}</h3><p>${d.mode === 'ai' ? `AI 创作 · ${esc(d.style)}` : `${users[role].name} 亲自演唱`} · 送给 ${users[other(role)].name}</p></div>${musicPlayer(`draft-${role}`)}${d.mode === 'ai' ? `${field('歌曲名', 'aiTitle', d.aiTitle, 'text', 'maxlength="30"')}${textarea('歌词 · 可以手动修改', 'aiLyrics', d.aiLyrics, 500)}` : `<div class="lyrics-box">${songs[d.song].lines.map(esc).join('<br>')}</div>`}${errorMarkup(role)}${action(d.mode === 'ai' ? 'edit-ai' : 'edit-record', d.mode === 'ai' ? '调整创作信息 / 重新生成' : '返回重录', 'back-link')}`, action('wrap', '给歌曲穿上礼物包装 →'));
  }
  function renderWrap(role) {
    const d = state.drafts[role];
    return frame(role, '包装这份心意', `<div class="progress-dots"><i class="done"></i><i class="done"></i><i class="done"></i></div>${giftPreview(role, d)}<div class="section-title">选一款礼物包装 <small>示意价格</small></div><div class="package-options">${Object.entries(packages).map(([key, p]) => action('package', `<span class="pack-symbol">${p.symbol}</span><strong>${p.name}</strong><span class="price">${p.price ? '¥' + cash(p.price) : '免费'}</span>`, `package-option ${d.pack === key ? 'selected' : ''}`, `data-value="${key}"`)).join('')}</div>${d.pack !== 'basic' ? `${field('AI 卡片画面关键词', 'cardPrompt', d.cardPrompt, 'text', 'maxlength="45"')}${action('generate-card', d.packageGenerated ? '✦ 换一张专属卡片' : '✦ 预览 AI 定制卡片', 'secondary')}` : ''}${textarea('写一句想说的话', 'blessing', d.blessing)}<label class="switch-row"><span>隐藏歌名，保留拆封惊喜<small>拆封前仍会显示你的昵称与祝福</small></span><input type="checkbox" data-field="surprise" ${d.surprise ? 'checked' : ''}></label><p class="small-note">收礼人可以免费拆封、完整收听。</p>`, action('send-page', '预览并选择送礼方式 →'));
  }
  function renderSend(role) {
    const d = state.drafts[role];
    return frame(role, '准备送出', `<div class="recipient">${avatar(other(role))}<div><strong>收礼人 · ${users[other(role)].name}</strong><small>从 ${users[role].name} 出发的一份心意</small></div><span class="chip" style="margin-left:auto">${channels[state.channel]}</span></div>${giftPreview(role, d)}<div class="section-title">送到哪里？</div><div class="channel-options">${Object.entries(channels).map(([key, name]) => action('channel', `<span>${key === 'app' ? '♪' : key === 'wechat' ? '◉' : '♧'}</span>${name}`, `channel-option ${state.channel === key ? 'selected' : ''}`, `data-value="${key}"`)).join('')}</div>${state.channel !== 'app' ? `<label class="switch-row"><span>再附赠一份新年红包<small>歌曲可以单独送出，红包为可选项</small></span><input type="checkbox" data-field="redEnabled" ${d.redEnabled ? 'checked' : ''}></label>${d.redEnabled ? `<div class="amount-box">${field('红包金额（元）', 'redAmount', d.redAmount, 'number', 'min="0.01" max="200" step="0.01" inputmode="decimal"')}<div class="amount-presets">${['6.66', '8.88', '18.88'].map(v => action('amount', `¥${v}`, '', `data-value="${v}"`)).join('')}</div><p class="small-note">演示范围 ¥0.01–¥200，红包金额给收礼人。</p></div>` : ''}` : ''}${summary(d)}${errorMarkup(role)}<p class="small-note">${state.channel === 'app' ? '礼物将出现在对方的「消息」中。' : `将生成${channels[state.channel]}分享卡片，对方打开即可拆封听歌。`}</p>`, action('confirm-send', sendLabel(d)) + '<p class="small-note">交互演示，不会向真实账户发送内容</p>');
  }
  function renderCheckout(role) {
    const d = state.drafts[role], busy = paying.has(role);
    return frame(role, '确认订单', `<div class="pay-icon">♡</div><div class="mini-heading">新年歌声礼物</div><div class="pay-amount"><small>¥</small>${cash(total(d))}</div><div class="recipient">${avatar(other(role))}<div><strong>${esc(titleOf(d))}</strong><small>送给 ${users[other(role)].name} · ${channels[state.channel]}</small></div></div>${summary(d)}<div class="user-result">${fee(d) > 0 ? `增值服务：¥${cash(fee(d))}<br>` : ''}${red(d) > 0 ? `附赠红包：¥${cash(red(d))}<br>` : ''}付款后即可送出，收礼人免费听歌。</div><p class="paid-note">本页仅模拟支付结果，不会真实扣款。</p>`, action('pay', busy ? '正在确认…' : '模拟付款成功并送出', 'primary', busy ? 'disabled' : '') + action('cancel-pay', '取消，返回修改', 'back-link', busy ? 'disabled' : ''));
  }
  function renderSuccess(role) {
    const g = selectedGift(role);
    if (!g) return renderOutbox(role);
    return frame(role, '礼物已送出', `<div class="success-mark">✓</div><h3 class="success-title">这份心意，已经送达</h3><p class="center-note">已通过 ${channels[g.channel]} 送给 ${users[g.to].name}<br>${g.opened ? '对方已拆封并看到你的祝福' : g.surprise ? '歌名将在拆封时揭晓' : '对方已可以打开歌曲礼物'}</p><div class="message-gift"><span class="mini-gift">♬</span><div><strong>${esc(g.title)}</strong><small>${packages[g.pack].name} · ${g.mode === 'ai' ? 'AI 创作' : '亲自演唱'}</small></div></div><div class="timeline"><div class="timeline-item done">礼物已送达<p>${channels[g.channel]} · ${users[g.to].name}</p></div><div class="timeline-item ${g.opened ? 'done' : ''}">${g.opened ? '对方已拆封' : '等待对方拆封'}<p>${g.played ? '已经播放你的歌曲' : g.opened ? '歌曲与祝福已揭晓' : '好心意，值得被慢慢打开'}</p></div>${g.redAmount > 0 ? `<div class="timeline-item ${g.claimed ? 'done' : ''}">${g.claimed ? '对方已领取红包' : '红包待领取'}<p>¥${cash(g.redAmount)}</p></div>` : ''}<div class="timeline-item ${g.reply ? 'done' : ''}">${g.reply ? '收到了 TA 的回应' : '等待 TA 的回应'}</div></div>${g.reply ? `<div class="response-bubble">${users[g.to].name}：${esc(g.reply)}</div>` : ''}`, action('switch-recipient', `切换到 ${g.to} 用户，看看 TA 收到的礼物 →`, 'primary', `data-gift="${g.id}"`) + action('new-gift', '再送一份新年心意', 'back-link'));
  }
  function giftCard(g, role, sent = false, chat = false) {
    const name = users[sent ? g.to : g.from].name, label = g.surprise && !g.opened && !sent ? '一首只送给你的新年歌' : g.title;
    const destination = sent ? 'sent-gift' : 'open-gift';
    return action(destination, `${!chat ? `<div class="message-head">${avatar(sent ? g.to : g.from)}<div><strong>${name}${sent ? '' : ' 送来一份歌曲礼物'}</strong><small>${sent ? '送给 TA 的新年第一首歌' : '2027 元旦 · 专属心意'}</small></div><span class="chip ${g.opened ? 'green' : ''}">${g.opened ? '已拆封' : '待拆封'}</span></div>` : ''}<div class="message-gift"><span class="mini-gift">${g.opened ? '♪' : '♬'}</span><div><strong>${esc(label)}</strong><small>${esc(g.blessing.slice(0, 36))}</small></div></div><div class="message-footer">${g.redAmount ? '附一份新年红包 · ' : ''}${chat ? '全民 K 歌 · 歌声礼物' : g.reply ? '已收到回应' : '点击' + (g.opened || sent ? '查看' : '拆封') + ' →'}</div>`, 'message-card', `data-gift="${g.id}"`);
  }
  function renderInbox(role) {
    const list = incoming(role), social = state.channel !== 'app';
    if (social) {
      return frame(role, users[other(role)].name, `<div class="chat-time">2027 年 1 月 1 日 00:00</div>${list.length ? list.map(g => `<div class="chat-line">${avatar(g.from)}${giftCard(g, role, false, true)}</div>${g.reply ? `<div class="chat-line self">${avatar(role)}<div class="chat-plain">${esc(g.reply)}</div></div>` : ''}`).join('') : `<div class="empty-state"><div class="empty-art">♬</div><h3>在等一首属于你的歌</h3><p>${users[other(role)].name} 从全民 K 歌送出后<br>这段聊天里就会出现礼物卡片</p>${action('switch-sender', `去 ${other(role)} 用户制作礼物`, 'secondary empty-cta')}</div>`}`, '', { social: true, className: `chat-body ${state.channel === 'qq' ? 'qq-body' : ''}` });
    }
    return frame(role, '消息', `<div class="section-title">新年心意 <small>${list.length} 份礼物</small></div>${list.length ? list.map(g => giftCard(g, role)).join('') : `<div class="empty-state"><div class="empty-art">♬</div><h3>在等一首属于你的歌</h3><p>${users[other(role)].name} 送出礼物后<br>就会出现在这里</p>${action('switch-sender', `去 ${other(role)} 用户制作礼物`, 'secondary empty-cta')}</div>`}`, '', { back: false, className: 'soft', bottom: 'inbox' });
  }
  function renderOutbox(role) {
    const list = outgoing(role);
    return `<div class="app-scroll no-pad my-scroll"><section class="my-hero"><div class="my-top-icons" aria-hidden="true"><span class="my-settings">⬡</span><span class="my-menu">☰</span></div><div class="my-identity"><span class="my-avatar" aria-hidden="true"></span><div><div class="my-name">${users[role].name} <span>⊕</span></div><div class="my-counts">粉丝 1　关注 3　好友 198<i></i></div></div></div><p class="my-signature">点击设置自己的个性签名</p><div class="my-badges">◆　K1　🏅　♀　8 岁　｜　勋章墙 0　礼物墙 0　⌄</div><div class="my-vip"><div><strong>◆ 会员中心 ›</strong><small>开通 VIP 解锁百万曲库和 40+ 特权</small></div><span>0.99 元开通</span></div></section><section class="my-shortcuts" aria-label="个人功能展示"><div><span>☻</span><small>任务中心</small></div><div><span>◕</span><small>已点</small></div><div><span>▣</span><small>K 币账户</small></div><div><span>◷</span><small>记录</small></div></section><div class="my-body"><div class="my-banner"><strong>连续刷视频赚金币</strong><small>多看多得，最高领 2000 金币　›</small><span aria-hidden="true">🧧</span></div><div class="my-section-tabs" aria-label="个人栏目展示"><span>资料</span><span>动态</span><strong>作品</strong><span>待合唱</span><em>▶ 播放</em><span>•••</span></div><div class="my-works"><article class="my-draft-card"><div class="my-draft-cover"><span>◆</span><strong>草稿箱</strong></div><strong>未发布作品</strong><small>发布得奖励</small></article>${action('open-work', '<span class="my-work-cover" aria-hidden="true"></span><strong>这世界那么多人</strong><small><b>SSS</b>　♬ 29</small>', 'my-work-card', 'aria-label="打开作品：这世界那么多人"')}</div>${list.length ? `<div class="my-sent-list"><h3>我送出的歌声礼物 <small>${channels[state.channel]}</small></h3>${list.map(g => `<article><strong>${esc(g.title)}</strong><span>${g.opened ? '已拆封' : '待拆封'}${g.reply ? ' · 已收到回应' : ''}</span>${g.reply ? `<p>${users[g.to].name}：${esc(g.reply)}</p>` : ''}</article>`).join('')}</div>` : ''}</div></div>${bottom(role, 'outbox')}`;
  }
  function renderWork(role) {
    return frame(role, '作品详情', `<div class="work-detail"><div class="work-detail-cover" aria-hidden="true"></div><h2>${publishedWork.title}</h2><p>${users[role].name} · 个人演唱作品</p><div class="work-detail-stats"><span>SSS</span><small>♬ 29 次收听</small></div><div class="work-detail-note">一首唱过的歌，也可以成为一份专属礼物。<br>送出后，对方可以拆封、收听并回应。</div></div>`, action('send-work', '送给他人 →'));
  }
  function renderGift(role) {
    const g = selectedGift(role);
    if (!g || g.to !== role) return renderInbox(role);
    if (!g.opened) {
      return frame(role, state.channel === 'app' ? '一份新年心意' : '全民 K 歌 · 歌声礼物', `<div class="seal-page ${g.pack} card-v${g.cardVariant || 0}"><div class="from-badge">${avatar(g.from)}${users[g.from].name} 送给你</div><h3 class="seal-title">新年的第一首歌<br>想唱给你听</h3><p class="seal-subtitle">TO ${users[role].name} · HAPPY 2027</p>${giftArt(g.pack, opening.has(g.id))}<p class="seal-blessing">“${esc(g.blessing)}”</p>${!g.surprise ? `<p class="center-note">《${esc(g.title)}》</p>` : ''}</div>`, action('unseal', opening.has(g.id) ? '心意正在揭晓…' : '拆开这份歌声礼物', 'primary', opening.has(g.id) ? 'disabled' : '') + `<p class="small-note">${g.surprise ? '歌名和旋律，拆开后揭晓' : '一份心意，等你听见'}${g.redAmount ? ' · 附赠新年红包' : ''}</p>`, { className: 'no-pad' });
    }
    return frame(role, '你的新年歌声礼物', `<div class="mini-heading">${users[g.from].name} 专门为你准备</div><div class="music-card"><div class="album ${g.mode === 'ai' ? 'ai-album' : ''}"><span>${g.pack === 'star' ? '☾' : '♪'}</span></div><h3>${esc(g.title)}</h3><p>${g.mode === 'ai' ? 'AI 创作' : users[g.from].name + ' 亲自演唱'} · 2027 新年限定</p></div>${musicPlayer('gift-' + g.id)}<div class="gift-letter">“${esc(g.blessing)}”<span>—— ${users[g.from].name}</span></div><div class="lyrics-box">${esc(g.lyrics).replace(/\n/g, '<br>')}</div>${g.redAmount ? action('claim', `<span class="red-icon">▣</span><span><strong>${g.claimed ? `已领取 ¥${cash(g.redAmount)}` : '还有一份新年红包'}</strong><small>${g.claimed ? '心意已收下 · 模拟领取' : '点击领取，不必听完整首歌'}</small></span>`, `red-packet ${g.claimed ? 'claimed' : ''}`, g.claimed ? 'disabled' : '') : ''}${g.reply ? `<div class="response-bubble">我的回应：${esc(g.reply)}</div>` : ''}`, `<div class="button-row">${action('reply-page', g.reply ? '再说一句谢谢' : '回应这份心意', 'secondary')}${action('return-gift', '回赠一首歌 ♡')}</div>`);
  }
  function renderReply(role) {
    const g = selectedGift(role);
    if (!g) return renderInbox(role);
    return frame(role, `回应 ${users[g.from].name}`, `<div class="music-card"><div class="album"><span>♡</span></div><h3>被惦记的感觉，真好</h3><p>告诉 TA，你收到这份心意了</p></div><div class="reply-options">${['听到了，超级喜欢 ♡', '新年快乐！一起加油 ✦', '被你的心意暖到了'].map(v => action('reply-preset', v, '', `data-value="${esc(v)}"`)).join('')}</div>${textarea('写下你的回应', 'replyText', state.drafts[role].replyText, 150)}${errorMarkup(role)}<p class="small-note">回应会同步到送礼人的礼物详情中。</p>`, action('reply-send', '送出回应 ♡'));
  }

  function renderRole(role, preserveScroll = false) {
    const root = document.getElementById('screen-' + role), previousScroll = root.querySelector('.app-scroll')?.scrollTop || 0;
    const renderers = { feed: renderFeed, home: renderHome, event: renderEvent, choose: renderChoose, record: renderRecord, ai: renderAI, generating: renderGenerating, review: renderReview, wrap: renderWrap, send: renderSend, checkout: renderCheckout, success: renderSuccess, inbox: renderInbox, outbox: renderOutbox, work: renderWork, gift: renderGift, reply: renderReply };
    root.innerHTML = (renderers[state.pages[role]] || renderHome)(role);
    if (preserveScroll) { const scroll = root.querySelector('.app-scroll'); if (scroll) scroll.scrollTop = previousScroll; }
    const steps = { feed: '看看好友的新年动态', home: '从活动中选择一份新年惊喜', event: '准备一份新年心意', choose: '选择自己的表达方式', record: '选歌，亲自唱给 TA', ai: '把回忆变成一首歌', generating: '专属歌曲创作中', review: '试听并确认这份心意', wrap: '挑选包装，写下祝福', send: '确认收礼人和渠道', checkout: '确认增值服务与红包', success: '已送出，等待心意回响', inbox: incoming(role).length ? '收到新年歌曲礼物' : '等待一份特别的祝福', outbox: '查看我的作品和送礼记录', work: '把演唱作品送给 TA', gift: selectedGift(role)?.opened ? '心意已揭晓，听听这首歌' : '有一份惊喜等你拆开', reply: '让心意有来有回' };
    document.getElementById('step-' + role).textContent = steps[state.pages[role]] || '';
    document.querySelector(`#device-${role} .persona-label`).textContent = ['inbox', 'gift', 'reply'].includes(state.pages[role]) ? '收礼视角' : '送礼视角';
  }
  function renderAll(preserve = false) {
    document.getElementById('stage').dataset.view = state.view;
    demo.querySelectorAll('[data-channel]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.channel === state.channel)));
    demo.querySelectorAll('[data-view]').forEach(b => { if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.view === state.view)); });
    renderRole('A', preserve); renderRole('B', preserve);
  }
  function navigate(role, page) { if (paying.has(role)) return; stopAudio(); if (record?.role === role) stopRecord(); errors[role] = ''; state.pages[role] = page; renderRole(role); save(); }
  function back(role) {
    const page = state.pages[role];
    if (page === 'generating') { clearTimeout(generationJobs[role]); delete generationJobs[role]; }
    if (paying.has(role) || opening.has(state.selected[role])) return;
    const map = { event: 'home', choose: 'event', record: 'choose', ai: 'choose', generating: 'ai', review: state.drafts[role].mode === 'ai' ? 'ai' : 'record', work: 'outbox', wrap: state.drafts[role].workGift ? 'work' : 'review', send: 'wrap', checkout: 'send', success: 'outbox', gift: 'inbox', reply: 'gift', inbox: 'home', outbox: 'home' };
    navigate(role, map[page] || 'home');
  }
  function setChannel(channel) {
    if (!channels[channel]) return;
    if (paying.size) { toast('正在确认礼物，请稍候再切换渠道'); return; }
    stopAudio(); stopRecord(); state.channel = channel;
    ['A', 'B'].forEach(r => {
      const page = state.pages[r];
      if (['gift', 'reply', 'success'].includes(page) && selectedGift(r)?.channel !== channel) state.pages[r] = page === 'success' ? 'outbox' : 'inbox';
      if (page === 'checkout') state.pages[r] = 'send';
    });
    renderAll(); save();
  }
  function formatTime(seconds) { return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); }
  function stopRecord() {
    if (!record) return;
    const r = record.role;
    state.drafts[r].recorded = true;
    state.drafts[r].recordedSeconds = Math.max(1, record.seconds);
    clearInterval(record.timer); record = null; renderRole(r, true); save();
  }
  function startRecord(role) {
    stopAudio(); if (record) stopRecord();
    state.drafts[role].recorded = false;
    record = { role, seconds: 0, timer: null };
    record.timer = setInterval(() => {
      if (!record) return;
      record.seconds++;
      const el = document.querySelector(`#screen-${record.role} [data-record-timer]`);
      if (el) el.textContent = formatTime(record.seconds);
      if (record.seconds >= 60) { const r = record.role; stopRecord(); renderRole(r); toast('演示录制已保存'); }
    }, 1000);
    renderRole(role);
  }
  function stopAudio() {
    if (!playback) return;
    const p = playback; playback = null; clearInterval(p.timer);
    if (p.context) p.context.close().catch(() => {});
    demo.querySelectorAll('[data-player]').forEach(el => {
      const b = el.querySelector('[data-action=play]'); if (b) { b.textContent = '▶'; b.setAttribute('aria-label', '播放示例伴奏'); }
      const bar = el.querySelector('[data-track]'); if (bar) bar.style.width = '0%';
      const time = el.querySelector('[data-elapsed]'); if (time) time.textContent = '0:00';
    });
  }
  async function play(key, role) {
    if (playback?.key === key) {
      const p = playback;
      try { if (p.paused) await p.context.resume(); else await p.context.suspend(); } catch (_) { stopAudio(); return; }
      if (playback !== p) return;
      p.paused = !p.paused;
      const button = demo.querySelector(`[data-player="${key}"] [data-action=play]`);
      if (button) { button.textContent = p.paused ? '▶' : 'Ⅱ'; button.setAttribute('aria-label', (p.paused ? '播放' : '暂停') + '示例伴奏'); }
      return;
    }
    stopAudio();
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { toast('当前浏览器不支持示例伴奏，其他交互仍可体验'); return; }
    try {
      const context = new Audio();
      const current = { context, key, seconds: 0, timer: null, paused: false };
      playback = current;
      await context.resume();
      if (playback !== current) return;
      const notes = [261.63, 329.63, 392, 440, 392, 329.63, 293.66, 329.63, 261.63, 329.63, 392, 523.25, 493.88, 440, 392, 329.63, 349.23, 440, 523.25, 440, 392, 349.23, 329.63, 293.66, 261.63, 329.63, 392, 440, 392, 329.63, 293.66, 261.63];
      const base = context.currentTime + .03;
      notes.forEach((frequency, i) => {
        const osc = context.createOscillator(), gain = context.createGain(), start = base + i * .55;
        osc.type = 'sine'; osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.14, start + .02); gain.gain.exponentialRampToValueAtTime(.001, start + .5);
        osc.connect(gain); gain.connect(context.destination); osc.start(start); osc.stop(start + .54);
      });
      if (key.startsWith('gift-')) {
        const g = state.gifts.find(g => g.id === Number(key.slice(5)));
        if (g && g.to === role && g.opened) { g.played = true; save(); renderRole(g.from, true); }
      }
      const update = () => {
        const el = demo.querySelector(`[data-player="${key}"]`);
        if (!el || !playback || playback !== current) return;
        const b = el.querySelector('[data-action=play]'); b.textContent = 'Ⅱ'; b.setAttribute('aria-label', '暂停示例伴奏');
        el.querySelector('[data-track]').style.width = current.seconds / 18 * 100 + '%';
        el.querySelector('[data-elapsed]').textContent = '0:' + String(current.seconds).padStart(2, '0');
      };
      update();
      current.timer = setInterval(() => { if (current.paused) return; current.seconds++; if (current.seconds >= 18) stopAudio(); else update(); }, 1000);
    } catch (_) { stopAudio(); toast('未能播放示例伴奏，请重新点击试听'); }
  }
  function generate(role) {
    const d = state.drafts[role];
    if (!d.wish.trim()) { errors[role] = '先写一句想对 TA 说的话吧。'; renderRole(role, true); return; }
    if (d.aiTier === 'custom' && !d.story.trim()) { errors[role] = '专属故事创作需要一段共同回忆。'; renderRole(role, true); return; }
    stopAudio(); errors[role] = ''; state.pages[role] = 'generating'; d.aiReady = false; renderRole(role);
    clearTimeout(generationJobs[role]);
    generationJobs[role] = setTimeout(() => {
      d.aiTitle = d.aiTier === 'custom' ? `写给${users[other(role)].name}的2027` : '新年的第一束光';
      d.aiLyrics = d.aiTier === 'custom' ? `${users[other(role)].name}，把这首歌唱给你\n还记得${d.story.trim()}\n${d.wish.trim()}\n新年的第一束光，照亮我们的方向` : `新年的风轻轻吹过\n把想说的话写成一首歌\n${d.wish.trim()}\n愿每个明天，都有温柔的回响`;
      d.aiReady = true; delete generationJobs[role];
      if (state.pages[role] === 'generating') state.pages[role] = 'review';
      renderRole(role); save();
    }, 1500);
  }
  function validateSend(role) {
    const d = state.drafts[role];
    if ((d.mode === 'record' && !d.recorded) || (d.mode === 'ai' && !d.aiReady)) { errors[role] = '请先完成录歌或 AI 创作。'; return false; }
    if (state.channel !== 'app' && d.redEnabled) {
      const amount = Number(d.redAmount);
      if (!Number.isFinite(amount) || amount < .01 || amount > 200 || Math.abs(amount * 100 - Math.round(amount * 100)) > .001) { errors[role] = '红包请输入 ¥0.01–¥200，最多两位小数。'; return false; }
    }
    errors[role] = ''; return true;
  }
  function sendGift(role) {
    paying.delete(role); delete payJobs[role];
    if (!['checkout', 'send'].includes(state.pages[role]) || !validateSend(role)) { renderRole(role, true); return; }
    const d = state.drafts[role], g = { id: state.nextId++, from: role, to: other(role), channel: state.channel, mode: d.mode, title: titleOf(d), lyrics: lyricsOf(d), blessing: d.blessing.trim() || '新年快乐，愿你被温柔以待。', pack: d.pack, cardPrompt: d.cardPrompt, cardVariant: d.cardVariant || 0, surprise: d.surprise, serviceFee: fee(d), redAmount: red(d), opened: false, played: false, claimed: false, reply: '', createdAt: Date.now() };
    state.gifts.push(g); state.selected[role] = g.id; state.pages[role] = 'success';
    const recipientPage = state.pages[g.to];
    if (['feed', 'home', 'event', 'inbox', 'outbox', 'success'].includes(recipientPage)) state.pages[g.to] = 'inbox';
    paying.delete(role); stopAudio(); renderAll(true); save(); toast(`礼物已送给 ${users[g.to].name}，切到 ${g.to} 用户拆封吧`);
  }
  function switchTo(role, page = null) {
    stopAudio(); if (record) { const r = record.role; stopRecord(); renderRole(r); }
    if (state.view !== 'both') state.view = role;
    if (page && !paying.has(role)) state.pages[role] = page;
    renderAll(true); save();
    document.getElementById('device-' + role).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function handle(role, name, button) {
    if (paying.has(role)) return;
    const d = state.drafts[role];
    switch (name) {
      case 'back': back(role); break;
      case 'nav': navigate(role, button.dataset.page); break;
      case 'open-event': navigate(role, 'event'); break;
      case 'open-work': navigate(role, 'work'); break;
      case 'send-work': state.drafts[role] = { ...freshDraft(role), mode: 'record', workGift: true, recorded: true, recordedSeconds: 58 }; navigate(role, 'wrap'); break;
      case 'choose': navigate(role, 'choose'); break;
      case 'start-record': d.mode = 'record'; d.workGift = false; navigate(role, 'record'); break;
      case 'start-ai': d.mode = 'ai'; d.workGift = false; navigate(role, 'ai'); break;
      case 'song': stopAudio(); if (record) stopRecord(); d.song = Number(button.dataset.index); d.workGift = false; d.recorded = false; d.recordedSeconds = 0; renderRole(role, true); save(); break;
      case 'record-toggle': if (record?.role === role) { stopRecord(); renderRole(role, true); } else startRecord(role); break;
      case 'review-record': if (d.recorded) navigate(role, 'review'); break;
      case 'style': d.style = button.dataset.value; d.aiReady = false; renderRole(role, true); save(); break;
      case 'ai-tier': d.aiTier = button.dataset.value; d.aiReady = false; renderRole(role, true); save(); break;
      case 'generate': generate(role); break;
      case 'play': play(button.dataset.key, role); break;
      case 'edit-ai': navigate(role, 'ai'); break;
      case 'edit-record': navigate(role, 'record'); break;
      case 'wrap': if (d.mode === 'ai' && (!d.aiTitle.trim() || !d.aiLyrics.trim())) { errors[role] = '请保留歌曲名和歌词，再继续包装。'; renderRole(role, true); } else navigate(role, 'wrap'); break;
      case 'package': d.pack = button.dataset.value; d.packageGenerated = false; d.cardVariant = 0; renderRole(role, true); save(); break;
      case 'generate-card': if (!d.cardPrompt.trim()) { toast('先写下卡片画面的关键词'); return; } d.packageGenerated = true; d.cardVariant = ((d.cardVariant || 0) + 1) % 3; renderRole(role, true); save(); toast('专属卡片预览已更新，确认送出时再购买'); break;
      case 'send-page': navigate(role, 'send'); break;
      case 'channel': setChannel(button.dataset.value); break;
      case 'amount': d.redAmount = button.dataset.value; renderRole(role, true); save(); break;
      case 'confirm-send': if (!validateSend(role)) { renderRole(role, true); break; } if (total(d) > 0) navigate(role, 'checkout'); else sendGift(role); break;
      case 'pay': paying.add(role); renderRole(role, true); payJobs[role] = setTimeout(() => sendGift(role), 700); break;
      case 'cancel-pay': if (!paying.has(role)) navigate(role, 'send'); break;
      case 'new-gift': state.drafts[role] = freshDraft(role); navigate(role, 'choose'); break;
      case 'switch-sender': switchTo(other(role)); break;
      case 'switch-recipient': { if (paying.size) { toast('礼物正在确认，完成后即可切换收礼页面'); break; } const g = state.gifts.find(g => g.id === Number(button.dataset.gift)); if (g) { state.channel = g.channel; switchTo(g.to, 'inbox'); } break; }
      case 'open-gift': state.selected[role] = Number(button.dataset.gift); navigate(role, 'gift'); break;
      case 'sent-gift': state.selected[role] = Number(button.dataset.gift); navigate(role, 'success'); break;
      case 'unseal': {
        const g = selectedGift(role); if (!g || g.opened || opening.has(g.id)) return;
        opening.add(g.id); renderRole(role);
        setTimeout(() => { opening.delete(g.id); if (!state.gifts.includes(g)) return; g.opened = true; renderAll(true); save(); }, 850); break;
      }
      case 'claim': { const g = selectedGift(role); if (!g || g.claimed || !g.redAmount) return; g.claimed = true; renderAll(true); save(); toast(`已模拟领取 ¥${cash(g.redAmount)}，心意已收下`); break; }
      case 'reply-page': d.replyText = ''; navigate(role, 'reply'); break;
      case 'reply-preset': d.replyText = button.dataset.value; renderRole(role, true); save(); break;
      case 'reply-send': { const g = selectedGift(role); if (!d.replyText.trim()) { errors[role] = '写点什么，或选择一句快捷回应吧。'; renderRole(role, true); return; } if (g) { g.reply = d.replyText.trim(); state.pages[role] = 'gift'; renderAll(true); save(); toast('回应已送达，对方可以看到你的心意了'); } break; }
      case 'return-gift': state.drafts[role] = freshDraft(role); state.drafts[role].blessing = '收到你的新年心意了，这首歌也送给你！'; navigate(role, 'choose'); break;
    }
  }

  demo.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.channel) { setChannel(button.dataset.channel); return; }
    if (button.dataset.view) { stopAudio(); if (record) stopRecord(); state.view = button.dataset.view; renderAll(true); save(); return; }
    if (button.id === 'restart') {
      stopAudio(); stopRecord(); Object.values(generationJobs).forEach(clearTimeout); Object.values(payJobs).forEach(clearTimeout); generationJobs = {}; payJobs = {}; paying.clear(); opening.clear();
      state = freshState(); errors.A = ''; errors.B = ''; renderAll(); save(); toast('已回到最初状态，可以体验另一条送礼路径'); return;
    }
    const screen = button.closest('[data-owner]');
    if (screen && button.dataset.action) handle(screen.dataset.owner, button.dataset.action, button);
  });
  demo.addEventListener('input', event => {
    const input = event.target, role = input.closest('[data-owner]')?.dataset.owner, key = input.dataset.field;
    if (!role || !key || input.type === 'checkbox' || input.tagName === 'SELECT') return;
    const d = state.drafts[role];
    if (!(key in d)) return;
    d[key] = input.value; errors[role] = '';
    if (key === 'wish' || key === 'story') d.aiReady = false;
    if (key === 'cardPrompt') d.packageGenerated = false;
    if (key === 'blessing') document.querySelectorAll(`#screen-${role} [data-live-blessing]`).forEach(el => { el.textContent = input.value || '愿新年的第一份心意，刚好被你听见。'; });
    if (key === 'redAmount') {
      document.querySelectorAll(`#screen-${role} [data-total]`).forEach(el => { el.textContent = totalLabel(d); });
      const btn = document.querySelector(`#screen-${role} [data-action="confirm-send"]`); if (btn) btn.textContent = sendLabel(d);
    }
    save();
  });
  demo.addEventListener('change', event => {
    const input = event.target, role = input.closest('[data-owner]')?.dataset.owner, key = input.dataset.field;
    if (!role || !key) return;
    const d = state.drafts[role]; if (!(key in d)) return;
    if (input.type === 'checkbox') { d[key] = input.checked; renderRole(role, true); }
    else if (input.tagName === 'SELECT') { d[key] = input.value; d.aiReady = false; }
    else if (key === 'redAmount') renderRole(role, true);
    save();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
  window.addEventListener('beforeunload', () => { stopRecord(); save(); });
  renderAll();
})();



