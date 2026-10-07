(async function () {
  // ============================================================
  // [HEADER] 实例管理 / 版本检测
  // ============================================================
  const WI_INSTANCE_ID = 'psychowi-preset-suture-tt';
  const WI_VERSION = '1.0.5';
  const __wiInstanceInfo = { id: WI_INSTANCE_ID, version: WI_VERSION, ts: Date.now(), kill: null };

  function __wiCompareVer(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const va = pa[i] || 0, vb = pb[i] || 0;
      if (va !== vb) return va - vb;
    }
    return 0;
  }

  const __wiTopWin = (function () {
    try {
      if (window.top && window.top !== window && window.top.document) return window.top;
    } catch (e) { }
    return window;
  })();
  __wiTopWin.__wiInstances = __wiTopWin.__wiInstances || [];
  const __wiAlive = [];
  let __wiShouldExit = false;

  for (const inst of __wiTopWin.__wiInstances) {
    if (!inst || inst.id !== WI_INSTANCE_ID) { __wiAlive.push(inst); continue; }
    const cmp = __wiCompareVer(inst.version, WI_VERSION);
    if (cmp > 0) {
      console.log('[预设缝合器] 检测到更高版本 ' + inst.version + '，本实例退出');
      __wiShouldExit = true;
      __wiAlive.push(inst);
      continue;
    }
    try { if (typeof inst.kill === 'function') inst.kill(); } catch (e) { }
  }
  __wiTopWin.__wiInstances = __wiAlive;

  if (__wiShouldExit) {
    console.log('[预设缝合器] 本实例退出');
    return;
  }

  __wiTopWin.__wiInstances.push(__wiInstanceInfo);

  // ============================================================
  // [BOOT] 等待酒馆助手 API
  // ============================================================
  async function waitTavernHelperAPI(maxWaitSec = 30) {
    const start = Date.now();
    while (Date.now() - start < maxWaitSec * 1000) {
      if (typeof getPreset === 'function' && typeof setPreset === 'function') {
        console.log("[psycho缝合] ✅酒馆助手API就绪");
        return true;
      }
      await new Promise(r => setTimeout(r, 800));
    }
    alert("[psycho缝合] ❌等待酒馆助手API超时");
    return false;
  }

  // ============================================================
  // [CORE] 核心常量 / 工具
  // ============================================================
  // ★ 热更新依赖 diff-match-patch
  window.__wiDiffReady = (async () => {
    try {
      const w = (window.top && window.top !== window) ? window.top : window;
      if (typeof w.diff_match_patch === 'function') {
        console.log('[热更新] diff-match-patch 已存在');
        return;
      }
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/diff-match-patch@1.0.5/index.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      console.log('[热更新] diff-match-patch 加载完成');
    } catch (e) {
      console.error('[热更新] diff-match-patch 加载失败:', e);
    }
  })();

  const PANEL_ID = 'wi_preset_suture_panel';
  const BTN_ID = 'wi_preset_suture_btn';

  // ★ TauriTavern（TT 手机 APK）环境检测
  function isTauriTavernEnv() {
    try {
      if (typeof window !== 'undefined' && window.__TAURITAVERN__) return true;
      if (typeof __wiTopWin !== 'undefined' && __wiTopWin && __wiTopWin.__TAURITAVERN__) return true;
    } catch (e) { }
    // 兜底：UA 里带 tauri / tauritavern
    try {
      const ua = String(navigator.userAgent || '');
      if (/tauritavern|tauri/i.test(ua)) return true;
    } catch (e) { }
    return false;
  }

  const __wiRootDoc = (function () {
    try {
      if (__wiTopWin && __wiTopWin.document) {
        return __wiTopWin.document;
      }
    } catch (e) { }
    return document;
  })();

  const log = (...args) => console.log('[psycho缝合]', ...args);
  const err = (...args) => console.error('[psycho缝合]', ...args);
  const warn = (...args) => console.warn('[psycho缝合]', ...args);

  function escapeHtml(s, maxLen = 999999) {
    let str = String(s ?? '');
    if (str.length > maxLen) str = str.slice(0, maxLen) + `\n…（已截断，原长 ${String(s ?? '').length} 字）`;
    return str.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function uuid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ============================================================
  // [VARIABLE] 变量解析器
  // ============================================================
  const VAR_REGEX_SET = /\{\{setvar::([^:]+?)::([\s\S]*?)\}\}/g;
  const VAR_REGEX_GET = /\{\{getvar::([^}]+?)\}\}/g;

  function parseSetVars(text) {
    if (!text) return [];
    const out = [];
    VAR_REGEX_SET.lastIndex = 0;
    let m;
    while ((m = VAR_REGEX_SET.exec(text)) !== null) {
      out.push({ name: m[1].trim(), value: m[2], raw: m[0], index: m.index });
    }
    return out;
  }

  function parseGetVars(text) {
    if (!text) return [];
    const out = [];
    VAR_REGEX_GET.lastIndex = 0;
    let m;
    while ((m = VAR_REGEX_GET.exec(text)) !== null) {
      out.push({ name: m[1].trim(), raw: m[0], index: m.index });
    }
    return out;
  }

  // ★ 剥离条目的 setvar 包裹：{{setvar::X::内容}} → 内容
  // 同时删除 {{getvar::X}} 引用（普通预设读不到变量）
  // 用于"变量预设 → 普通预设"的缝合
  function stripSetvarWrappers(content) {
    if (!content) return content;
    let out = String(content);
    // 1. 剥离 setvar 包裹（循环，处理嵌套）
    let prev;
    do {
      prev = out;
      out = out.replace(/\{\{setvar::[^:]+?::([\s\S]*?)\}\}/g, '$1');
    } while (out !== prev);
    // 2. 删除 getvar 引用（连同前后的空白/换行一起删，避免留空行）
    out = out.replace(/[ \t]*\{\{getvar::[^}]+\}\}[ \t]*\n?/g, '');
    // 3. 清理可能留下的多余空行（3 个以上连续换行压成 2 个）
    out = out.replace(/\n{3,}/g, '\n\n');
    return out.trim();
  }

  function parseNumberedVarName(name) {
    const m = String(name).match(/^(.+?)(\d+)$/);
    if (!m) return null;
    return { prefix: m[1], num: parseInt(m[2], 10) };
  }

  function isAssignmentSetVar(setvar) {
    const v = setvar.value;
    if (v === null || v === undefined) return false;
    if (typeof v !== 'string') return true;
    return v.trim().length > 0;
  }

  // ============================================================
  // [AUX API] 缝合器自己的 AI 配置
  // ============================================================
  const AI_CONFIG_KEY = 'wi_preset_suture_ai_config';

  function loadAiConfig() {
    try {
      const raw = localStorage.getItem(AI_CONFIG_KEY);
      if (!raw) return { url: '', key: '', model: '' };
      const d = JSON.parse(raw);
      return { url: d.url || '', key: d.key || '', model: d.model || '' };
    } catch (e) {
      return { url: '', key: '', model: '' };
    }
  }

  function saveAiConfig(cfg) {
    try { localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(cfg)); } catch (e) { }
  }

  function isAiConfigReady(cfg) {
    const c = cfg || loadAiConfig();
    return !!(c.url && c.model);
  }

  async function callAuxApi(messages, opts = {}) {
    const api = loadAiConfig();
    if (!isAiConfigReady(api)) throw new Error('未配置 AI');
    let url = api.url.replace(/\/+$/, '');
    if (!/\/chat\/completions$/i.test(url)) url = url + '/chat/completions';
    const body = {
      model: api.model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 20000,
    };

    console.log('[缝合器][AI] ===== 发起请求 =====');
    console.log('[缝合器][AI] URL:', url);
    console.log('[缝合器][AI] model:', api.model);
    console.log('[缝合器][AI] messages 条数:', messages.length);
    console.log('[缝合器][AI] messages:', JSON.parse(JSON.stringify(messages)));
    const t0 = Date.now();

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(api.key ? { 'Authorization': 'Bearer ' + api.key } : {}),
      },
      body: JSON.stringify(body),
    });
    console.log('[缝合器][AI] 响应状态:', resp.status, ' 耗时:', (Date.now() - t0) + 'ms');

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.error('[缝合器][AI] ❌ 请求失败，响应体:', txt);
      throw new Error(`API ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const data = await resp.json();
    console.log('[缝合器][AI] ===== 原始响应 JSON =====');
    console.log(data);
    const text = (
      data?.choices?.[0]?.message?.content
      || data?.content?.[0]?.text
      || data?.candidates?.[0]?.content?.parts?.[0]?.text
      || ''
    );
    console.log('[缝合器][AI] 提取出的文本长度:', text.length);
    console.log('[缝合器][AI] 提取出的文本:\n', text);
    return text;
  }

  async function fetchModelList(cfg) {
    const api = cfg || loadAiConfig();
    if (!api.url) throw new Error('未填 API 地址');
    const url = api.url.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/models';
    const resp = await fetch(url, {
      method: 'GET',
      headers: { ...(api.key ? { 'Authorization': 'Bearer ' + api.key } : {}) },
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 150)}`);
    }
    const data = await resp.json();
    if (Array.isArray(data?.data)) return data.data.map(m => m.id || m.name).filter(Boolean);
    if (Array.isArray(data)) return data.map(m => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
    if (Array.isArray(data?.models)) return data.models.map(m => m.name || m.id).filter(Boolean);
    throw new Error('返回格式不认识');
  }

  function extractJsonFromAI(raw) {
    const s = String(raw || '');
    let parsed = null;
    try { parsed = JSON.parse(s.trim()); } catch (e) { }
    if (!parsed) {
      const m1 = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (m1) { try { parsed = JSON.parse(m1[1].trim()); } catch (e) { } }
    }
    if (!parsed) {
      const startIdx = s.indexOf('{');
      if (startIdx >= 0) {
        let depth = 0, endIdx = -1;
        for (let i = startIdx; i < s.length; i++) {
          if (s[i] === '{') depth++;
          else if (s[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
        }
        if (endIdx > startIdx) { try { parsed = JSON.parse(s.slice(startIdx, endIdx + 1)); } catch (e) { } }
      }
    }
    return parsed;
  }

  // ============================================================
  // [AI] 结构分析
  // ============================================================
  async function aiAnalyzeStructure(entryNames) {
    if (!isAiConfigReady()) return { zones: [], raw: '', error: '未配置 AI' };
    if (!Array.isArray(entryNames) || entryNames.length === 0) return { zones: [], raw: '', error: '条目列表为空' };

    const list = entryNames.map((n, i) => `${i + 1}. ${n}`).join('\n');

    const sysPrompt = `你是一个 SillyTavern 预设结构分析助手。

用户会给你一个预设的**所有条目名**（按从上到下的顺序，带编号）。

任务：把条目**从上到下切分成若干"分区"**（连续的段落）。

【切分粒度 - 非常重要】

1. **宁可多切，不要少切**。允许切出 **10~30 个**分区。
2. **任何一个 zone 条目数超过 25 条，就必须再细分**。
   - 例如"文风" 78 条 → 拆成"文风主规则"、"文风选择"、"文风补充"等多个 zone
   - 例如"NSFW" 49 条 → 拆成"NSFW 总纲"、"NSFW 具体流程"、"NSFW 偏好开关"等
3. **宁可名字相似，也要语义精准**。用户手动改名字比手动挪条目容易。

【分隔行线索 - 必须利用】

预设作者会用"分隔行"手写区段标记。**这些分隔行是非常强的切分信号**。

识别下列形式：
- 「╓XXX╖」 = **区头**（XXX 区的开始）
- 「╙XXX╜」 = **区尾**（XXX 区的结束）
- 「——XXX——」 = **分隔线**（XXX 是区段名；同名分隔线出现两次时，第二次通常是"结束"标记）
- 「>>>XXX<<<」 = **主流程结束标记**
- 其他以「——」开头结尾的，也当作分隔线处理

**切分规则**：
- **区头到它对应的区尾之间**（含头尾本身）**必须切在同一个 zone**。
  - 例如「╓破限勿动╖」到「╙破限尾部╜」之间所有条目 + 头尾本身 = 一个 zone。
- **只有区尾没有区头**时（比如「╙📌塑造结束╜」前面没有「╓📌人物塑造╖」），**并入上一个 zone**，作为它的结尾。
- **同名分隔线出现两次**时（比如「——🪓特殊功能——」出现两次），**两次之间 + 第二次本身 = 同一个 zone**。
- **没有分隔行的段落**（例如预设顶部 1~9 条）也要**根据内容语义**切一两个 zone，不要全归一个 "(顶部)"。

【通用规则】

4. 每个分区是**一段连续**的条目。
5. 分区必须**从头到尾连续覆盖**，不能有断层或重叠。
6. 分区名要**简短、有意义**，能概括这一段条目的功能。
   - 好例子："破限区"、"基本规则"、"文风主规则"、"NSFW 具体流程"、"状态栏"、"世界设定"
   - 坏例子："第一区"、"其他"、"杂项"、"(顶部)"
7. 分区是**从上往下看的功能分组**，不是"东一个西一个"。

【COT 区的强制规则 - 必须遵守】

8. 预设里**必然存在**一个"COT 区"（思维链区）。它的条目名通常包含以下关键词（不限于）：
   - cot / COT / CoT
   - 思维链 / 思考 / 思维 / 推理 / 内在
   - thinking / think
9. 你必须切出一个 zoneName 就叫 **COT区** 的分区（固定命名，不要改成"思维链区"之类）。
10. COT区 的范围：**所有名字以「COT-」开头、或含 COT 关键字的条目，都要算进 COT区**，即使它们中间夹着别的条目。
    - 比如 303~310 是「COT-✅SFW视野推演」等，即使它们和 277~302 之间隔着别的东西，**也要算进 COT区**。
    - 如果实在不连续，取**最集中的那一段**。
11. 分区列表里有且仅有一个 zoneName 叫 **COT区**。

输出格式（只返回 JSON，无其他文字）：
{
  "zones": [
    { "startIndex": 1, "endIndex": 9, "zoneName": "预设顶部信息", "zoneType": "other", "reason": "包含使用说明、参数设置、注入变量等" },
    { "startIndex": 10, "endIndex": 44, "zoneName": "破限区", "zoneType": "other", "reason": "从 ╓破限勿动╖ 到 ╙破限尾部╜ 的完整破限段" }
  ]
}

其中 zoneType 字段：COT区 必须填 "cot"，其他分区填 "other"。

⚠️ 再次强调：**10~30 个 zone，宁可多切不要少切**。`;

    const userPrompt = `预设共有 ${entryNames.length} 个条目，从上到下的列表：\n\n${list}\n\n请返回分区切分结果。`;

    try {
      console.log('[缝合器 AI 结构分析] system prompt 长度 =', sysPrompt.length);
      console.log('[缝合器 AI 结构分析] user prompt 长度 =', userPrompt.length);
      const content = await callAuxApi([
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.2, max_tokens: 20000 });

      console.log('[缝合器 AI 结构分析原始返回]', content);
      const parsed = extractJsonFromAI(content);

      if (parsed && Array.isArray(parsed.zones)) {
        const zones = parsed.zones
          .map(z => ({
            startIdx: Math.max(0, (parseInt(z.startIndex, 10) || 1) - 1),
            endIdx: Math.min(entryNames.length - 1, (parseInt(z.endIndex, 10) || 1) - 1),
            name: z.zoneName || z.name || '(未命名区)',
            zoneType: z.zoneType || (z.zoneName === 'COT区' ? 'cot' : 'other'),
            reason: z.reason || '',
            entryCount: 0,
            _mode: 'ai-structure',
          }))
          .filter(z => z.endIdx >= z.startIdx)
          .sort((a, b) => a.startIdx - b.startIdx);

        zones.forEach(z => {
          z.entryCount = z.endIdx - z.startIdx + 1;
          z.sampleNames = entryNames.slice(z.startIdx, z.endIdx + 1).slice(0, 8);
          z.allNames = entryNames.slice(z.startIdx, z.endIdx + 1);
        });

        return { zones, raw: content, error: null };
      }

      return { zones: [], raw: content, error: 'AI 返回格式无法解析' };
    } catch (e) {
      return { zones: [], raw: '', error: '请求失败：' + (e.message || e) };
    }
  }

  // ============================================================
  // [AI SUTURE PLAN] AI 缝合规划（一批多条）
  // ============================================================
  async function aiPlanSutureBatch(items, structure, targetPreset) {
    if (!isAiConfigReady()) return { results: [], raw: '', error: '未配置 AI' };
    if (!items.length) return { results: [], raw: '', error: '无条目' };

    const entries = extractOrderedEntries(targetPreset);
    const zoneEntriesMap = new Map();
    structure.zones.forEach(z => {
      const names = [];
      for (let i = z.startIdx; i <= z.endIdx && i < entries.length; i++) {
        names.push(entries[i].name);
      }
      zoneEntriesMap.set(z.name, names);
    });

    const isVariablePreset = !!structure.varInitEntry;
    const ctxVarInit = structure.varInitEntry
      ? `【获取变量区】：${structure.varInitEntry.name}`
      : '（未识别到获取变量区 → **目标预设是"无变量系统"，请走普通缝合模式**）';
    const cotZone = structure.zones.find(z => z.zoneType === 'cot');

    let ctxCotZone = '（未识别到 COT 区）';
    let cotEnabledEntries = [];
    if (cotZone) {
      const allCotEntries = [];
      for (let i = cotZone.startIdx; i <= cotZone.endIdx && i < entries.length; i++) {
        if (entries[i]) allCotEntries.push(entries[i]);
      }
      cotEnabledEntries = allCotEntries.filter(e => e.enabled !== false);
      const listStr = cotEnabledEntries.map((e, i) => `${i + 1}. ${e.name}`).join('\n');
      ctxCotZone = `【COT区】：${cotZone.name}\n**已启用条目列表**（从这些里挑）：\n${listStr}${cotEnabledEntries.length === 0 ? '（无已启用条目）' : ''}`;
    }

    const zoneList = structure.zones.map(z => {
      const names = zoneEntriesMap.get(z.name) || [];
      const namesStr = names.slice(0, 30).map((n, i) => `${z.startIdx + 1 + i}. ${n}`).join('\n');
      const reasonStr = z.reason ? `｜${z.reason}` : '';
      return `### ${z.name}（共 ${names.length} 条${reasonStr}）\n${namesStr}${names.length > 30 ? '\n...(还有 ' + (names.length - 30) + ' 条)' : ''}`;
    }).join('\n\n');

    // ★ 分组信息（按批次的偏移）
    const groups = state.sutureSourceGroups || [];
    // 本批 items 在全局的位置：items 是全局切片，所以需要知道全局起点
    // 用 sourceId 反查全局 items
    const allSrcEntries = extractOrderedEntries(state.sutureSourcePreset);
    const globalItems = [];
    for (const [id] of Object.entries(state.suturePick).filter(([_, v]) => v.checked)) {
      const e = allSrcEntries.find(x => x.identifier === id);
      if (e) globalItems.push({ sourceId: id, sourceName: e.name });
    }
    const globalIdxMap = new Map();
    globalItems.forEach((g, i) => globalIdxMap.set(g.sourceId, i));

    // 每条 item 的全局 index
    const itemGlobalIdx = items.map(it => globalIdxMap.get(it.sourceId) ?? -1);

    // 找本批里每条 item 属于哪个组
    const groupInfoMap = new Map();  // sourceId -> { groupId, isLeader, memberNames, leaderName }
    groups.forEach((g, gi) => {
      const memberNames = [];
      for (let k = g.startIdx; k <= g.endIdx; k++) {
        if (globalItems[k]) memberNames.push(globalItems[k].sourceName);
      }
      for (let k = g.startIdx; k <= g.endIdx; k++) {
        if (!globalItems[k]) continue;
        groupInfoMap.set(globalItems[k].sourceId, {
          groupId: gi + 1,
          isLeader: k === g.leaderIdx,
          memberNames,
          leaderName: globalItems[g.leaderIdx]?.sourceName || '',
        });
      }
    });

    const itemList = items.map((it, i) => {
      const sv = parseSetVars(it.sourceContent || '');
      const gv = parseGetVars(it.sourceContent || '');
      const varInfo = sv.length > 0 ? `\n- 内含 setvar：${sv.map(s => s.name).join('、')}` : '';
      const getInfo = gv.length > 0 ? `\n- 内含 getvar：${gv.map(g => g.name).join('、')}` : '';

      const gi = groupInfoMap.get(it.sourceId);
      let groupNote = '';
      if (gi) {
        if (gi.isLeader) {
          groupNote = `\n- ⚠️ **这是一组「${gi.memberNames[0]}」的第 1 条（组首）**，本组共 ${gi.memberNames.length} 条：${gi.memberNames.join(' → ')}\n- **本组必须整体插到同一个位置**，组内条目按顺序依次排列，不可拆开。你只需要为本条（组首）规划位置，组内其他条目会自动跟随。`;
        } else {
          groupNote = `\n- ⚠️ **这是组「${gi.leaderName}」的成员之一（组内第 ${gi.memberNames.indexOf(it.sourceName) + 1} 条）**。**不要单独为本条规划位置**，它跟随组首。请把本条也返回，但 zone / insertAfter 随便填（会被忽略）。`;
        }
      }

      return `【源条目 ${i + 1}】（id=${it.sourceId}）\n- 名称：${it.sourceName}\n- 内容：\n${(it.sourceContent || '').slice(0, 1200)}${varInfo}${getInfo}${groupNote}`;
    }).join('\n\n---\n\n');

    const sysPrompt = `你是 SillyTavern 预设缝合助手。用户从源预设挑了若干条目，要缝到目标预设里。

【目标预设结构】

${ctxVarInit}
${ctxCotZone}

【目标预设的分区】

⚠️ 注意：填写 zone 时**只填分区名本身**（比如 "COT区"、"文风区"），**不要加任何后缀**。

${zoneList}

【任务】

⚠️ 本目标预设：**${isVariablePreset ? '有变量系统' : '无变量系统'}**
${targetPreset && targetPreset._isWorldbook ? '⚠️ 本次源条目来自**世界书**（不是预设）。世界书条目没有变量系统，按下面的规则处理。' : ''}

${isVariablePreset ? '（走变量缝合：setvar + getvar）' : '（走普通缝合：<> 标签包裹，不挂 getvar）'}

对每个源条目，规划缝合方案：

1. **zone**：插到哪个分区（填分区名，原样复制）
2. **insertAfter**：插到该分区内**哪个条目之后**（填条目名，必须在该分区的成员列表里；如果该分区为空或你需要插到最前面，填 "__FIRST__"；如果想插到分区末尾，填 "__LAST__"）
   - 你要根据内容**判断放哪条后面最合适**，而不是无脑末尾
   - 例如源条目是"冷淡风文风"，而分区里已有"文风18（冷淡）"，就插到它后面
3. **entryName**：缝合后的条目名（简明、体现内容、可带 emoji）
3.5 **wrapTag**：如果目标预设没有变量系统，内容会用 <> 标签包裹。
   - 给这条起一个**简单的标签名**（纯 ASCII 或简单中文，**不带 emoji，不带空格**）
   - 如果源条目**头尾已经有 <xxx>...</xxx> 包裹**，wrapTag 填 null（不重复包）
   - 如果目标预设**有变量系统**，wrapTag 也填 null（用不上）
4. **wrapVar**：
   - 源条目**已有 setvar** → null（脚本会保留原变量名，不额外包）
   - 源条目**无变量**（纯文本）→ 起一个有意义的中文变量名（别叫"缝合条目1"）
   - 变量名别和已有变量重名

   ⚠️ 记住：**只要 wrapVar 非 null，或源条目本来带 setvar，就必然要挂 getvar**（见下方 cotPlan 规则）。
5. **cotPlan**：COT 处理（**每条都必须填，不能省略**）

   ⚠️ **先判断这条是不是 COT 类**：
   - 如果 entryName 以 COT- 开头，或内容含 <thinking> / </thinking> / 思维链 → 这条是 COT 类
   - **COT 类的条目**：cotPlan 填 **{"type": "none"}**（因为它自己就是 COT，不需要挂到别的 COT）
   - **非 COT 类的条目**：按下面情况 A/B/C 处理

   ⚠️⚠️⚠️ **核心机制说明（必须先理解）**：

   酒馆里 {{setvar::X::内容}} 只是**给变量 X 赋值**，**内容不会进入上下文**。
   只有 {{getvar::X}} 才能把变量 X 的内容**拉进上下文**给 AI 看到。
   **所以：任何带 setvar 的内容，如果没被某个 COT 条目 getvar 引用，就等于白写。**

   **因此规则如下（强制）**：

   **情况 A：源条目带 setvar（不管是不是 COT 类）**
   → **必须**填 { type: getvar, getvarName: 这条的变量名, getvarTargetCot: 从【COT区已启用条目列表】里挑一个最合适的 }
   - 如果源条目本来就有 setvar（比如 {{setvar::写作禁令5::...}}），getvarName 就填那个变量名（如 写作禁令5）
   - 如果源条目没有 setvar，wrapVar 填个新变量名，getvarName 跟它一致
   - getvarTargetCot 必须从上面给的【COT区已启用条目列表】里一字不差复制一个，绝对不能编。

   **情况 B：源条目是 COT 类**（名字或内容里含 cot/思维链/思考/推理/thinking/自检）
   → 除了挂 getvar（同 A），还要考虑要不要 {"type": "new", ...} 生成新 COT
   - 一般倾向 getvar（优先利用现有 COT 条目，避免 COT 区膨胀）
   - 只有当源条目提供了一套全新的思维链结构，且现有 COT 都装不下时，才用 new

   **情况 C：源条目既不带 setvar 也不是 COT 类**
   → 这种情况几乎不存在（不带 setvar 的话 wrapVar 会填一个新变量名，就变成带 setvar 了）
   → 如果确实有（用户明确不想包变量），填 {"type": "none"}

   **总结：99% 的情况下，你都要填 {"type": "getvar", ...}。**

   ⚠️ **例外**：如果目标预设**没有变量系统**（脚本会告诉你），
   - cotPlan 全部填 {"type": "none"}
   - 内容会用 <> 标签包裹（你给 wrapTag 字段）
   - 不要试图包装 setvar/getvar

   - ⚠️ 重要：getvarTargetCot 必须从上面给的【COT区已启用条目列表】里选一个，不能编。
   - ⚠️ 重要：如果 cotPlan.type 是 getvar，那么 wrapVar 也必须填一个非 null 的变量名（就是 getvarName 同一个）。
   - ⚠️ 重要：不允许对任何带 setvar 的条目填 { type: none }。
6. **reason**：一句话理由

【输出格式】

只返回 JSON：
{
  "results": [
    {
      "sourceIndex": 1,
      "sourceId": "原条目 id",
      "zone": "文风区",
      "insertAfter": "文风18",
      "entryName": "文风-月读式",
      "wrapVar": "文风月读",
      "cotPlan": { "type": "none" },
      "reason": "冷淡风格，插到冷淡文风条目后"
    }
  ]
}`;

    const userPrompt = `请为以下 ${items.length} 个源条目规划缝合方案：\n\n${itemList}`;

    try {
      console.log('[缝合器 AI 缝合规划] ===== 请求 =====');
      console.log('[缝合器 AI 缝合规划] system prompt 长度 =', sysPrompt.length);
      console.log('[缝合器 AI 缝合规划] user prompt 长度 =', userPrompt.length);
      console.log('[缝合器 AI 缝合规划] 本批条目数 =', items.length);
      console.log('[缝合器 AI 缝合规划] 完整 system prompt:\n', sysPrompt);
      console.log('[缝合器 AI 缝合规划] 完整 user prompt:\n', userPrompt);

      const content = await callAuxApi([
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt },
      ], { temperature: 0.3, max_tokens: 30000 });

      console.log('[缝合器 AI 缝合规划] ===== 返回 =====');
      console.log('[缝合器 AI 缝合规划原始返回]', content);
      const parsed = extractJsonFromAI(content);

      if (parsed && Array.isArray(parsed.results)) {
        parsed.results.forEach((r, i) => {
          if (!r.sourceId) {
            const src = items[r.sourceIndex - 1] || items[i];
            if (src) r.sourceId = src.sourceId;
          }
        });
        return { results: parsed.results, raw: content, error: null };
      }
      return { results: [], raw: content, error: 'AI 返回格式无法解析' };
    } catch (e) {
      return { results: [], raw: '', error: '请求失败：' + (e.message || e) };
    }
  }

  // ============================================================
  // [AI COT REWRITE] 一次请求重写多个 COT 条目
  // ============================================================
  async function aiRewriteCotEntries(entries) {
    if (!isAiConfigReady()) return { results: [], error: '未配置 AI' };
    if (!Array.isArray(entries) || entries.length === 0) {
      return { results: [], error: '没有要重写的 COT 条目' };
    }

    // 构造每个 COT 条目的输入块
    const blocks = entries.map((e, i) => {
      const varsList = e.vars.map(v => `  - ${v.name}（内容摘要）：${(v.content || '').slice(0, 200)}`).join('\n');
      return `【COT 条目 ${i + 1}】名字：${e.entryName}
内容：
"""
${e.originalContent}
"""

要挂的新变量：
${varsList}`;
    }).join('\n\n==================================================\n\n');

    const sysPrompt = `你是 SillyTavern 预设编辑助手。

用户有 ${entries.length} 个 COT（思维链）条目，需要你**分别读懂它们的风格和格式**，然后**分别模仿各自的风格**，把对应的"新变量引用"融入每个 COT 里。

【COT 条目列表】

${blocks}

【任务】

对**每一个** COT 条目，**分别**做以下操作：

1. 读懂该 COT 条目的结构、语气、格式。
2. 把它的"新变量"用 {{getvar::xxx}} 格式加到 COT 里：
   - 位置由你判断（放在语境最合适的地方，通常是相关段落之后）
   - 可以加简短的衔接说明（可选），也可以直接插入 {{getvar::xxx}}
   - ⚠️ **所有新增内容必须包在 /* WI-SUTURE-START */ 和 /* WI-SUTURE-END */ 之间**，例如：
   - **格式必须是 {{getvar::xxx}}**，不要模仿原 COT 里可能出现的 [xxx] / 「xxx」 / <xxx> 等写法
3. **该 COT 条目里的所有已有内容，一律不改**：
   - 已有的 {{getvar::xxx}} 引用不动
   - 已有的 [xxx] / 「xxx」 等硬编码文本不动
   - 已有的模板、注释、说明文字全部保留
4. **只做追加**：把新变量加到合适位置，不要删减、不要改写原内容。

【输出格式】

只返回 JSON，**不要代码块，不要解释**：

{
  "rewrites": [
    { "entryName": "条目1的原名（一字不差）", "content": "重写后的完整内容" },
    { "entryName": "条目2的原名", "content": "重写后的完整内容" }
  ]
}

⚠️ **entryName 必须跟输入里每个 COT 条目的名字一字不差**，顺序跟输入一致。`;

    try {
      console.log('[缝合器][COT重写] ===== 发起批量请求 =====');
      console.log('[缝合器][COT重写] COT 条目数:', entries.length);
      const content = await callAuxApi(
        [{ role: 'user', content: sysPrompt }],
        { temperature: 0.3, max_tokens: 40000 }
      );
      console.log('[缝合器][COT重写] ===== 返回 =====');
      console.log('[缝合器][COT重写原始返回]', content);

      const parsed = extractJsonFromAI(content);
      if (parsed && Array.isArray(parsed.rewrites)) {
        return { results: parsed.rewrites, error: null, raw: content };
      }
      return { results: [], error: 'AI 返回格式无法解析', raw: content };
    } catch (e) {
      return { results: [], error: '请求失败：' + (e.message || e), raw: '' };
    }
  }

  // ============================================================
  // [HOT UPDATE] 预设热更新（对比两个本地 JSON，写回目标预设）
  // ============================================================
  function huEscapeHtml(s, maxLen = 999999) {
    if (typeof escapeHtml === 'function') return escapeHtml(s, maxLen);
    return String(s ?? '').slice(0, maxLen);
  }

  function huCharCountColor(n) {
    if (n < 500) return 'var(--wi-ok)';
    if (n < 2000) return 'var(--wi-warn)';
    return 'var(--wi-err)';
  }

  function huSafeFilename(s) {
    return String(s || 'export').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  }

  function huDownloadJson(filename, data) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (e) {
      console.error('[热更新] 下载失败', e);
      return false;
    }
  }

  function huPickJsonFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = () => {
        const file = input.files && input.files[0];
        document.body.removeChild(input);
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, text: String(reader.result || '') });
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // ★ 缝合器标记段
  const HU_SUTURE_MARK_START = '/* WI-SUTURE-START */';
  const HU_SUTURE_MARK_END = '/* WI-SUTURE-END */';

  // ★ 剥离 setvar / getvar / HTML 注释（用于"忽略变量"的对比）
  function huStripVars(content) {
    let s = String(content || '');
    // ★ 先剥离缝合器标记段（含衔接语 + getvar）
    s = s.replace(new RegExp(
      HU_SUTURE_MARK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[\\s\\S]*?' +
      HU_SUTURE_MARK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'g'
    ), '');
    // 去其他 HTML 注释
    s = s.replace(new RegExp('<' + '!--[\\s\\S]*?--' + '>', 'g'), '');
    // 去 setvar（带内容的和空的都去）
    s = s.replace(/\{\{setvar::[^:]+?::[\s\S]*?\}\}/g, '');
    // 去 getvar
    s = s.replace(/\{\{getvar::[^}]+\}\}/g, '');
    // 去多余空行
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  // ★ 提取所有 setvar / getvar / HTML 注释（用于"搬"到新版）
  function huExtractVars(content) {
    const s = String(content || '');
    const setvars = [];
    const getvars = [];
    const comments = [];
    const sutureBlocks = [];   // ★ 缝合器标记段（整段）
    let m;

    // ★ 先提取缝合器标记段
    const reSuture = new RegExp(
      HU_SUTURE_MARK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[\\s\\S]*?' +
      HU_SUTURE_MARK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'g'
    );
    while ((m = reSuture.exec(s)) !== null) sutureBlocks.push(m[0]);

    // 剥离标记段后，再提取单独的 setvar / getvar / 注释
    let rest = s;
    sutureBlocks.forEach(block => { rest = rest.split(block).join(''); });

    const reSet = /\{\{setvar::[^:]+?::[\s\S]*?\}\}/g;
    while ((m = reSet.exec(rest)) !== null) setvars.push(m[0]);
    const reGet = /\{\{getvar::[^}]+\}\}/g;
    while ((m = reGet.exec(rest)) !== null) getvars.push(m[0]);
    const reComment = new RegExp('<' + '!--[\\s\\S]*?--' + '>', 'g');
    while ((m = reComment.exec(rest)) !== null) comments.push(m[0]);
    return { setvars, getvars, comments, sutureBlocks };
  }

  // ★ 预设差异对比（按 id / identifier 匹配）
  function huDiffPresets(oldPreset, newPreset) {
    const getList = (preset) => {
      const raw = Array.isArray(preset?.prompts) ? preset.prompts : [];
      // ★ 从 extensions 里读缝合来源表（identifier -> 来源）
      const originsMap = preset?.extensions?.wi_preset_suture_origins || {};
      return raw
        .filter(p => p && typeof p === 'object')
        .map(p => {
          const nm = (p.name || '').trim();
          const id = p.identifier || p.id || '';
          // ★ 优先用 extensions 里的记录；其次用条目自带字段（老兼容）；
          //   最后从名字里解析 [来自...] 后缀（老老格式）
          let sutureFrom = originsMap[id] || p._wiSutureFrom || null;
          if (!sutureFrom) {
            const m = nm.match(/^(.*?)\s*\[来自(.+?)\]\s*$/);
            if (m) {
              sutureFrom = m[2].trim();
            }
          }
          return {
            id,
            name: nm,
            content: p.content || '',
            enabled: p.enabled !== false,
            _wiSutureFrom: sutureFrom,
            _wiOldFormat: !originsMap[id] && !p._wiSutureFrom && !!sutureFrom,
            raw: p,
          };
        })
        .filter(p => p.id);
    };

    const oldList = getList(oldPreset);
    const newList = getList(newPreset);

    // ★ 按名字匹配（id 可能对不上）
    // 名字重复的，用 "名字#序号" 区分
    function buildNameMap(list) {
      const m = new Map();
      const nameCount = {};
      list.forEach(p => {
        const baseName = p.name || '(无名称)';
        nameCount[baseName] = (nameCount[baseName] || 0) + 1;
        const key = nameCount[baseName] > 1 ? `${baseName}#${nameCount[baseName]}` : baseName;
        m.set(key, { ...p, _key: key, _baseName: baseName });
      });
      return m;
    }

    const oldMap = buildNameMap(oldList);
    const newMap = buildNameMap(newList);

    const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
    const diffs = [];

    allKeys.forEach(key => {
      const o = oldMap.get(key);
      const n = newMap.get(key);
      const id = key;   // 用名字当 key

      // 下面逻辑不变，只是把 id 换成 key

      if (o && !n) {
        diffs.push({
          status: 'deleted',
          id,
          key,
          name: o.name,
          oldEntry: o.raw,
          oldContent: o.content,
          newContent: '',
          oldContentRaw: o.content,
          newContentRaw: '',
          oldLen: o.content.length,
          newLen: 0,
          oldEnabled: o.enabled,
          newEntry: null,
          _wiSutureFrom: o._wiSutureFrom || null,   // ★
        });
      } else if (!o && n) {
        console.log('[diff][added] key=', key, ' name=', n.name, ' raw=', !!n.raw);
        diffs.push({
          status: 'added',
          id,
          key,
          name: n.name,
          oldContent: '',
          newContent: n.content,
          oldContentRaw: '',
          newContentRaw: n.content,
          oldLen: 0,
          newLen: n.content.length,
          newEnabled: n.enabled,
          newEntry: n.raw,
          _wiSutureFrom: n._wiSutureFrom || null,   // ★
        });
      } else if (o && n) {
        const nameChanged = o.name !== n.name;
        // ★ 对比时忽略 setvar / getvar
        const oContentStripped = huStripVars(o.content);
        const nContentStripped = huStripVars(n.content);
        const contentChanged = oContentStripped !== nContentStripped;
        const enabledChanged = o.enabled !== n.enabled;
        // ★ 只有名字或"去变量后的内容"变了才算差异
        if (nameChanged || contentChanged || enabledChanged) {
          diffs.push({
            status: 'modified',
            id,
            key,
            name: n.name,
            oldName: o.name,
            newName: n.name,
            // ★ 显示 diff 用剥离后的内容（这样 getvar 不会出现在 diff 里）
            oldContent: oContentStripped,
            newContent: nContentStripped,
            // ★ 应用时用原始内容（保留新版原有的变量）
            oldContentRaw: o.content,
            newContentRaw: n.content,
            oldLen: oContentStripped.length,
            newLen: nContentStripped.length,
            oldEnabled: o.enabled,
            newEnabled: n.enabled,
            nameChanged, contentChanged, enabledChanged,
            newEntry: n.raw,
            _wiSutureFrom: n._wiSutureFrom || o._wiSutureFrom || null,   // ★
          });
        }
      }
    });

    // 排序：新增 → 修改 → 删除
    const order = { added: 0, modified: 1, deleted: 2 };
    diffs.sort((a, b) => order[a.status] - order[b.status]);
    window.__wiLastDiffs = diffs;   // 保留，方便后续调试
    return diffs;
  }

  // ★ 文本字符级 diff 渲染
  function huRenderTextDiff(oldText, newText) {
    const w = (window.top && window.top !== window) ? window.top : window;
    const DMP = w.diff_match_patch;

    if (typeof DMP !== 'function') {
      // 降级：并排显示
      return `
        <div style="display:flex;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;color:var(--wi-text-dim);margin-bottom:3px">旧版 (${oldText.length}字)</div>
            <pre style="margin:0;padding:6px;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:4px;font-size:11px;color:var(--wi-text);white-space:pre-wrap;word-break:break-word;max-height:300px;overflow:auto">${huEscapeHtml(oldText)}</pre>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;color:var(--wi-text-dim);margin-bottom:3px">新版 (${newText.length}字)</div>
            <pre style="margin:0;padding:6px;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:4px;font-size:11px;color:var(--wi-text);white-space:pre-wrap;word-break:break-word;max-height:300px;overflow:auto">${huEscapeHtml(newText)}</pre>
          </div>
        </div>`;
    }

    const dmp = new DMP();
    const diffs = dmp.diff_main(oldText || '', newText || '');
    dmp.diff_cleanupSemantic(diffs);

    let addedChars = 0, removedChars = 0;
    diffs.forEach(([op, text]) => {
      if (op === 1) addedChars += text.length;
      else if (op === -1) removedChars += text.length;
    });

    const CTX = 15;
    const parts = [];
    diffs.forEach(([op, text]) => {
      if (op === 0) {
        if (text.length <= CTX * 2 + 5) {
          parts.push({ type: 'same', text });
        } else {
          parts.push({ type: 'same', text: text.slice(0, CTX) });
          parts.push({ type: 'gap', text: `… ${text.length - CTX * 2} 字未变 …` });
          parts.push({ type: 'same', text: text.slice(-CTX) });
        }
      } else if (op === -1) {
        parts.push({ type: 'del', text });
      } else if (op === 1) {
        parts.push({ type: 'add', text });
      }
    });

    const htmlParts = parts.map(p => {
      const t = huEscapeHtml(p.text);
      if (p.type === 'same') return `<span style="color:var(--wi-text-dim);white-space:pre-wrap">${t}</span>`;
      if (p.type === 'gap') return `<span style="color:var(--wi-text-dim);font-style:italic;padding:0 4px">${t}</span>`;
      if (p.type === 'del') return `<span style="background:color-mix(in srgb, var(--wi-err) 25%, transparent);color:var(--wi-err);text-decoration:line-through;border-radius:2px;padding:0 1px;white-space:pre-wrap">${t}</span>`;
      if (p.type === 'add') return `<span style="background:color-mix(in srgb, var(--wi-ok) 25%, transparent);color:var(--wi-ok);border-radius:2px;padding:0 1px;white-space:pre-wrap">${t}</span>`;
      return t;
    }).join('');

    const stats = [];
    if (removedChars > 0) stats.push(`<span style="color:var(--wi-err)">−${removedChars} 字</span>`);
    if (addedChars > 0) stats.push(`<span style="color:var(--wi-ok)">+${addedChars} 字</span>`);

    return `
      <div style="font-size:10px;color:var(--wi-text-dim);margin-bottom:6px;display:flex;gap:8px;align-items:center">
        <span>旧版 ${oldText.length} 字 → 新版 ${newText.length} 字</span>
        ${stats.length ? `<span style="margin-left:auto">${stats.join('  ')}</span>` : ''}
      </div>
      <div style="padding:8px;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:4px;font-size:11px;line-height:1.6;color:var(--wi-text);max-height:400px;overflow:auto;word-break:break-word;font-family:monospace">${htmlParts || '<span style="color:var(--wi-text-dim);font-style:italic">(空)</span>'}</div>
    `;
  }

  function renderHotUpdateUI() {
    const $container = $('#wi_ps_hotupdate_content');
    if (!$container.length) return;

    const presetNames = getAllPresetNames();

    let html = `
    <div style="font-size:15px;font-weight:700;color:var(--wi-ok);margin-bottom:12px">🔄 预设热更新</div>

    <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:14px;font-size:11px;color:var(--wi-text);line-height:1.7">
      <b style="color:var(--wi-ok)">流程：</b>
      ① 选预设（旧版，含缝合痕迹）→ ② 选新版 JSON → ③ 对比 → ④ 应用（原地写回该预设）。
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:8px;padding:14px">
        <div style="font-size:13px;color:var(--wi-warn);font-weight:600;margin-bottom:8px">📤 旧版预设（缝合痕迹来源）</div>
        <select id="wi_hu_old_preset" style="${INPUT_CSS}color-scheme:var(--SmartThemeColorScheme, dark)">
          ${presetNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}
        </select>
        <div id="wi_hu_old_info" style="font-size:11px;color:var(--wi-text-dim);margin-top:8px">已选预设</div>
      </div>
      <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:8px;padding:14px">
        <div style="font-size:13px;color:var(--wi-ok);font-weight:600;margin-bottom:8px">📥 新版 JSON（基底）</div>
        <button id="wi_hu_pick_new" style="${BTN_CSS}">选择文件…</button>
        <div id="wi_hu_new_info" style="font-size:11px;color:var(--wi-text-dim);margin-top:8px">未选择</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-bottom:14px">
      <button id="wi_hu_migrate_old" style="${BTN_AI_CSS}padding:8px 16px;font-size:12px">🔧 迁移老缝合痕迹</button>
      <button id="wi_hu_migrate_new" style="${BTN_AI_CSS}padding:8px 16px;font-size:12px">🔧 迁移新缝合痕迹</button>
      <button id="wi_hu_compare" style="${BTN_PRIMARY_CSS}padding:8px 24px;font-size:13px" disabled>🔍 对比</button>
    </div>

    <div id="wi_hu_diff_panel"></div>
  `;

    $container.html(html);

    const $oldInfo = $container.find('#wi_hu_old_info');
    const $newInfo = $container.find('#wi_hu_new_info');
    const $compareBtn = $container.find('#wi_hu_compare');
    const $panel = $container.find('#wi_hu_diff_panel');

    let oldJson = null, newJson = null;

    function loadOldPreset() {
      const name = $container.find('#wi_hu_old_preset').val();
      if (!name) {
        oldJson = null;
        $oldInfo.text('未选预设').css('color', 'var(--wi-text-dim)');
        updateCompareBtn();
        return;
      }
      const p = readPreset(name);
      if (!p) {
        oldJson = null;
        $oldInfo.text('读取失败').css('color', 'var(--wi-err)');
        updateCompareBtn();
        return;
      }
      oldJson = p;
      const cnt = (p.prompts || []).length;
      $oldInfo.html(`✅ <b style="color:var(--wi-ok)">${escapeHtml(name)}</b>（${cnt} 条）`).css('color', 'var(--wi-text)');
      updateCompareBtn();
    }

    function updateCompareBtn() {
      $compareBtn.prop('disabled', !(oldJson && newJson));
    }

    $container.find('#wi_hu_old_preset').on('change', loadOldPreset);
    loadOldPreset();

    $container.find('#wi_hu_pick_new').on('click', async () => {
      const picked = await huPickJsonFile();
      if (!picked) return;
      try {
        newJson = JSON.parse(picked.text);
        window.__wiLastNewJson = newJson;
        const cnt = (newJson.prompts || []).length;
        $newInfo.html(`✅ <b style="color:var(--wi-ok)">${escapeHtml(picked.name)}</b>（${cnt} 条）`).css('color', 'var(--wi-text)');
        updateCompareBtn();
      } catch (e) {
        alert('❌ 新版 JSON 解析失败：' + (e.message || e));
        newJson = null;
        $newInfo.text('解析失败').css('color', 'var(--wi-err)');
        updateCompareBtn();
      }
    });

    // ★ 迁移老缝合痕迹
    $container.find('#wi_hu_migrate_old').on('click', () => {
      const name = $container.find('#wi_hu_old_preset').val();
      if (!name) { alert('未选旧版预设'); return; }
      const preset = readPreset(name);
      if (!preset) { alert('读取失败'); return; }

      // 扫出所有名字带 [来自...] 的条目
      const raw = Array.isArray(preset.prompts) ? preset.prompts : [];
      const targets = [];
      raw.forEach((p, idx) => {
        if (!p || typeof p !== 'object') return;
        const nm = (p.name || '').trim();
        const m = nm.match(/^(.*?)\s*\[来自(.+?)\]\s*$/);
        if (m) {
          const id = p.identifier || p.id || '';
          targets.push({
            idx,
            id,
            oldName: nm,
            newName: m[1].trim(),
            from: m[2].trim(),
          });
        }
      });

      if (targets.length === 0) {
        alert('✅ 没发现名字里带 [来自...] 的老缝合条目，无需迁移。');
        return;
      }

      // 弹窗让用户确认
      showMigrateConfirmDialog(name, preset, targets);
    });

    // ★ 迁移新缝合痕迹：extensions → 名字 [来自...]
    $container.find('#wi_hu_migrate_new').on('click', () => {
      const name = $container.find('#wi_hu_old_preset').val();
      if (!name) { alert('未选预设'); return; }
      const preset = readPreset(name);
      if (!preset) { alert('读取失败'); return; }

      const origins = preset?.extensions?.wi_preset_suture_origins || {};
      const raw = Array.isArray(preset.prompts) ? preset.prompts : [];
      const targets = [];
      raw.forEach((p, idx) => {
        if (!p || typeof p !== 'object') return;
        const id = p.identifier || p.id || '';
        if (!id) return;
        const from = origins[id];
        if (!from) return;   // 没有 extensions 记录 → 不是新缝合
        const nm = (p.name || '').trim();
        if (/\[来自.+?\]\s*$/.test(nm)) return;   // 名字已有后缀 → 跳过
        targets.push({
          idx,
          id,
          oldName: nm,
          newName: nm + ' [来自' + from + ']',
          from,
        });
      });

      if (targets.length === 0) {
        alert('✅ 没发现"来源只存在 extensions 里"的新缝合条目，无需迁移。');
        return;
      }

      showMigrateNewConfirmDialog(name, preset, targets);
    });

    $container.find('#wi_hu_compare').on('click', () => {
      if (!oldJson || !newJson) return;
      const diffs = huDiffPresets(oldJson, newJson);
      if (diffs.length === 0) {
        $panel.html('<div style="color:var(--wi-ok);padding:20px;text-align:center;font-size:13px">✅ 两个 JSON 的 prompts 完全一致，无差异</div>');
        return;
      }
      huRenderPresetDiffPanel($panel, diffs, (selectedIdx) => {
        const targetName = $container.find('#wi_hu_old_preset').val();
        if (!targetName) { alert('未选预设'); return; }
        applyPresetHotUpdate(targetName, diffs, selectedIdx);
      });
    });
  }

  // ★ 差异面板
  function huRenderPresetDiffPanel($container, diffs, onApply) {
    const statusMeta = {
      added: { icon: '🟢', text: '新增', color: 'var(--wi-ok)' },
      modified: { icon: '🟡', text: '修改', color: 'var(--wi-warn)' },
      deleted: { icon: '🔴', text: '删除', color: 'var(--wi-err)' },
    };

    const diffHtml = diffs.map((d, i) => {
      const sm = statusMeta[d.status] || statusMeta.modified;
      let summaryHtml = '';
      if (d.status === 'added') {
        summaryHtml = `<span style="color:var(--wi-text-dim)">${d.newLen} 字</span>`;
      } else if (d.status === 'deleted') {
        summaryHtml = `<span style="color:var(--wi-text-dim)">${d.oldLen} 字</span>`;
      } else {
        const parts = [];
        if (d.nameChanged) parts.push('名字');
        if (d.contentChanged) parts.push(`${d.oldLen} 字 → ${d.newLen} 字`);
        if (d.enabledChanged) parts.push(`启用 ${d.oldEnabled ? '是' : '否'} → ${d.newEnabled ? '是' : '否'}`);
        summaryHtml = `<span style="color:var(--wi-text-dim)">${parts.join(' · ')}</span>`;
      }

      return `
        <div class="wi-hu-diff-item" data-idx="${i}" style="border:1px solid var(--wi-border);border-radius:6px;padding:8px;margin-bottom:8px;background:var(--wi-bg-1)">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" class="wi-hu-diff-cb" data-idx="${i}" ${d._wiSutureFrom ? '' : 'checked'} style="cursor:pointer">
            <span style="font-size:12px;color:${sm.color};font-weight:600">${sm.icon} ${sm.text}</span>
            <span style="font-size:12px;color:var(--wi-text);font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d.name)}${d._wiSutureFrom ? ` <span style="font-size:10px;color:var(--wi-accent-2);background:var(--wi-bg-2);padding:1px 5px;border-radius:3px;font-weight:400">🩹 ${escapeHtml(d._wiSutureFrom)}</span>` : ''}</span>
            ${summaryHtml}
          </label>
          <div style="margin-top:4px">
            <span class="wi-hu-expand" data-idx="${i}" style="font-size:11px;color:var(--wi-accent);cursor:pointer;user-select:none">展开对比 ▼</span>
          </div>
          <div class="wi-hu-detail" data-idx="${i}" style="display:none;margin-top:6px"></div>
        </div>
      `;
    }).join('');

    // ★ 统计各类数量
    const catCount = { added: 0, modified: 0, deleted: 0, suture: 0 };
    diffs.forEach(d => {
      const isSuture = !!d._wiSutureFrom;
      if (isSuture) catCount.suture++;
      else if (d.status === 'added') catCount.added++;
      else if (d.status === 'modified') catCount.modified++;
      else if (d.status === 'deleted') catCount.deleted++;
    });

    $container.html(`
      <div style="font-size:14px;font-weight:700;color:var(--wi-text);margin-bottom:6px">🔍 差异对比（共 ${diffs.length} 处）</div>
      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:10px;line-height:1.6">
        <b style="color:var(--wi-text)">默认全部勾选</b>。不想应用的取消勾选即可。<br>
        <span style="color:var(--wi-warn)">💡 缝合进来的条目（新老都算）默认<b>不勾选</b>，需要时手动勾上。</span>
      </div>
      <div id="wi_hu_filter_bar" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--wi-border-soft)">
        <button class="wi-hu-filter-btn" data-filter="all" style="${BTN_CSS}font-size:11px;padding:4px 10px;background:var(--wi-accent);color:var(--wi-btn-fg,#fff);border-color:var(--wi-accent)">全部 ${diffs.length}</button>
        <button class="wi-hu-filter-btn" data-filter="added" style="${BTN_CSS}font-size:11px;padding:4px 10px;color:var(--wi-ok);border-color:var(--wi-ok)">🟢 新增 ${catCount.added}</button>
        <button class="wi-hu-filter-btn" data-filter="modified" style="${BTN_CSS}font-size:11px;padding:4px 10px;color:var(--wi-warn);border-color:var(--wi-warn)">🟡 修改 ${catCount.modified}</button>
        <button class="wi-hu-filter-btn" data-filter="deleted" style="${BTN_CSS}font-size:11px;padding:4px 10px;color:var(--wi-err);border-color:var(--wi-err)">🔴 删除 ${catCount.deleted}</button>
        <button class="wi-hu-filter-btn" data-filter="suture" style="${BTN_CSS}font-size:11px;padding:4px 10px;color:var(--wi-accent-2);border-color:var(--wi-accent-2)">🩹 缝合 ${catCount.suture}</button>
      </div>
      <div id="wi_hu_diff_list" style="max-height:50vh;overflow-y:auto;padding-right:4px">
        ${diffHtml}
      </div>
      <div style="margin-top:10px;display:flex;gap:6px;justify-content:space-between;align-items:center;flex-wrap:wrap">
        <div style="display:flex;gap:6px">
          <button class="wi-hu-batch" style="${BTN_CSS}font-size:11px">🎛 批量选择</button>
        </div>
        <button class="wi-hu-apply" style="${BTN_PRIMARY_CSS}padding:8px 20px;font-size:13px">✅ 应用选中的改动</button>
      </div>
    `);

    // ★ 筛选按钮
    $container.find('.wi-hu-filter-btn').on('click', function () {
      const filter = $(this).attr('data-filter');

      // 切换按钮高亮
      $container.find('.wi-hu-filter-btn').each(function () {
        const f = $(this).attr('data-filter');
        if (f === filter) {
          $(this).css({ background: 'var(--wi-accent)', color: 'var(--wi-btn-fg,#fff)', borderColor: 'var(--wi-accent)' });
        } else {
          $(this).css({ background: 'var(--wi-bg-2)', color: '', borderColor: 'var(--wi-border)' });
          // 恢复原本的颜色文字
          if (f === 'added') $(this).css('color', 'var(--wi-ok)').css('borderColor', 'var(--wi-ok)');
          if (f === 'modified') $(this).css('color', 'var(--wi-warn)').css('borderColor', 'var(--wi-warn)');
          if (f === 'deleted') $(this).css('color', 'var(--wi-err)').css('borderColor', 'var(--wi-err)');
          if (f === 'suture') $(this).css('color', 'var(--wi-accent-2)').css('borderColor', 'var(--wi-accent-2)');
        }
      });

      // 显示/隐藏
      $container.find('.wi-hu-diff-item').each(function () {
        const idx = Number($(this).attr('data-idx'));
        const d = diffs[idx];
        if (!d) return;
        const isSuture = !!d._wiSutureFrom;
        const cat = isSuture ? 'suture' : d.status;
        if (filter === 'all' || cat === filter) {
          $(this).show();
        } else {
          $(this).hide();
        }
      });
    });

    $container.find('.wi-hu-expand').on('click', function () {
      const idx = Number($(this).data('idx'));
      const $detail = $container.find(`.wi-hu-detail[data-idx="${idx}"]`);
      if ($detail.is(':visible')) {
        $detail.hide();
        $(this).text('展开对比 ▼');
        return;
      }
      if ($detail.data('rendered') !== true) {
        const d = diffs[idx];
        let html = '';
        if (d.status === 'added') {
          html = `<div style="font-size:11px;color:var(--wi-ok);margin-bottom:6px">🟢 新条目，将添加进预设</div>` + huRenderTextDiff('', d.newContent);
        } else if (d.status === 'deleted') {
          html = `<div style="font-size:11px;color:var(--wi-err);margin-bottom:6px">🔴 旧条目，将从预设移除</div>` + huRenderTextDiff(d.oldContent, '');
        } else {
          if (d.nameChanged) {
            html += `<div style="font-size:11px;color:var(--wi-warn);margin-bottom:6px">名字：<span style="color:var(--wi-err)">${escapeHtml(d.oldName)}</span> → <span style="color:var(--wi-ok)">${escapeHtml(d.newName)}</span></div>`;
          }
          if (d.enabledChanged) {
            html += `<div style="font-size:11px;color:var(--wi-warn);margin-bottom:6px">启用：${d.oldEnabled ? '是' : '否'} → ${d.newEnabled ? '是' : '否'}</div>`;
          }
          if (d.contentChanged) {
            html += huRenderTextDiff(d.oldContent, d.newContent);
          }
        }
        $detail.html(html).data('rendered', true);
      }
      $detail.show();
      $(this).text('收起 ▲');
    });

    // ★ 分类批量勾选：浮层 popover（点旁边失焦消失，实时生效）
    function openBatchPopover($anchor) {
      // 关掉已有的
      __wiRootDoc.querySelectorAll('#wi_ps_batch_popover').forEach(el => el.remove());

      const catCount = { added: 0, modified: 0, deleted: 0, suture: 0 };
      diffs.forEach(d => {
        const isSuture = !!d._wiSutureFrom;
        if (isSuture) catCount.suture++;
        else if (d.status === 'added') catCount.added++;
        else if (d.status === 'modified') catCount.modified++;
        else if (d.status === 'deleted') catCount.deleted++;
      });

      // 判断当前每类的"勾选状态"：全勾 / 全不勾 / 部分
      function catState(cat) {
        let total = 0, checked = 0;
        $container.find('.wi-hu-diff-cb').each(function () {
          const idx = Number($(this).data('idx'));
          const d = diffs[idx];
          if (!d) return;
          const isSuture = !!d._wiSutureFrom;
          const c = isSuture ? 'suture' : d.status;
          if (c !== cat) return;
          total++;
          if ($(this).is(':checked')) checked++;
        });
        return { total, checked, all: total > 0 && checked === total, none: checked === 0 };
      }

      const $pop = $('<div id="wi_ps_batch_popover">').css({
        position: 'absolute',
        background: 'var(--wi-box-bg)',
        border: '1px solid var(--wi-border)',
        borderRadius: '8px',
        padding: '8px',
        minWidth: '240px',
        zIndex: 1000030,
        boxShadow: 'var(--SmartThemeShadowColor, 0 8px 24px rgba(0,0,0,.5))',
        color: 'var(--wi-text)',
      });

      // 标题
      $pop.append(`
        <div style="font-size:11px;color:var(--wi-text-dim);padding:2px 8px 6px;border-bottom:1px solid var(--wi-border-soft);margin-bottom:6px">🎛 批量选择（点类别 = 全勾/全不勾）</div>
      `);

      // 四行分类
      const cats = [
        { key: 'added', label: '🟢 新增', color: 'var(--wi-ok)' },
        { key: 'modified', label: '🟡 修改', color: 'var(--wi-warn)' },
        { key: 'deleted', label: '🔴 删除', color: 'var(--wi-err)' },
        { key: 'suture', label: '🩹 缝合', color: 'var(--wi-accent-2)' },
      ];

      cats.forEach(c => {
        const st = catState(c.key);
        const count = catCount[c.key];
        const disabled = count === 0;
        const rowHtml = `
          <div class="wi-ps-pop-row" data-cat="${c.key}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? 0.4 : 1}">
            <input type="checkbox" class="wi-ps-pop-cb" data-cat="${c.key}" ${st.all ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="cursor:pointer">
            <span style="flex:1;font-size:12px;color:${c.color}">${c.label}</span>
            <span style="font-size:11px;color:var(--wi-text-dim)">${st.checked}/${count}</span>
          </div>
        `;
        $pop.append(rowHtml);
      });

      // 底部快捷：全部勾 / 全部不勾
      $pop.append(`
        <div style="border-top:1px solid var(--wi-border-soft);margin-top:6px;padding-top:6px;display:flex;gap:6px">
          <button class="wi-ps-pop-all" style="${BTN_CSS}flex:1;font-size:11px;padding:4px 8px">全部勾</button>
          <button class="wi-ps-pop-none" style="${BTN_CSS}flex:1;font-size:11px;padding:4px 8px">全部不勾</button>
        </div>
      `);

      $('#' + PANEL_ID).append($pop);

      // ★ 定位到按钮下方
      const anchorRect = $anchor[0].getBoundingClientRect();
      const panelEl = $('#' + PANEL_ID)[0];
      const panelRect = panelEl.getBoundingClientRect();

      // 相对面板定位
      let left = anchorRect.left - panelRect.left;
      let top = anchorRect.bottom - panelRect.top + 4;

      // 防止超出面板右边界
      const popW = $pop.outerWidth();
      const panelW = panelRect.width;
      if (left + popW > panelW - 8) left = panelW - popW - 8;
      if (left < 8) left = 8;

      // 防止超出面板下边界（如果超了，就往上弹）
      const popH = $pop.outerHeight();
      const panelH = panelRect.height;
      if (top + popH > panelH - 8) {
        top = anchorRect.top - panelRect.top - popH - 4;
        if (top < 8) top = 8;
      }

      $pop.css({ left: left + 'px', top: top + 'px' });

      // ★ 应用某个分类的勾选状态
      function applyCat(cat, checked) {
        $container.find('.wi-hu-diff-cb').each(function () {
          const idx = Number($(this).data('idx'));
          const d = diffs[idx];
          if (!d) return;
          const isSuture = !!d._wiSutureFrom;
          const c = isSuture ? 'suture' : d.status;
          if (c !== cat) return;
          $(this).prop('checked', checked);
        });
      }

      // ★ 刷新 popover 里的计数 + 复选框状态
      function refreshPop() {
        $pop.find('.wi-ps-pop-row').each(function () {
          const cat = $(this).attr('data-cat');
          const st = catState(cat);
          const count = catCount[cat];
          $(this).find('.wi-ps-pop-cb').prop('checked', st.all);
          $(this).find('span').eq(1).text(`${st.checked}/${count}`);
        });
      }

      // 行点击 → 切换该类（全勾 ↔ 全不勾）
      $pop.find('.wi-ps-pop-row').on('click', function (e) {
        if (e.target.tagName === 'INPUT') return;  // 复选框自己处理
        const cat = $(this).attr('data-cat');
        const count = catCount[cat];
        if (count === 0) return;
        const st = catState(cat);
        applyCat(cat, !st.all);
        refreshPop();
      });

      // 复选框直接点
      $pop.find('.wi-ps-pop-cb').on('click', function (e) {
        e.stopPropagation();
        const cat = $(this).attr('data-cat');
        applyCat(cat, $(this).is(':checked'));
        refreshPop();
      });

      $pop.find('.wi-ps-pop-all').on('click', () => {
        $container.find('.wi-hu-diff-cb').prop('checked', true);
        refreshPop();
      });
      $pop.find('.wi-ps-pop-none').on('click', () => {
        $container.find('.wi-hu-diff-cb').prop('checked', false);
        refreshPop();
      });

      // ★ 失焦关闭：点别处就消失
      setTimeout(() => {
        const closeHandler = (ev) => {
          // 如果点的是 popover 自己，忽略
          if ($pop[0] && $pop[0].contains(ev.target)) return;
          // 如果点的是触发按钮，忽略（让按钮自己的 click 处理）
          if ($anchor[0] && $anchor[0].contains(ev.target)) return;
          $pop.remove();
          __wiRootDoc.removeEventListener('mousedown', closeHandler, true);
        };
        __wiRootDoc.addEventListener('mousedown', closeHandler, true);
        // 存一份，popover 被移除时也清掉
        $pop.data('_closeHandler', closeHandler);
      }, 0);
    }

    // 按钮点击 → 打开 popover
    $container.find('.wi-hu-batch').on('click', function (e) {
      e.stopPropagation();
      const $pop = $('#wi_ps_batch_popover');
      if ($pop.length) {
        // 已开着 → 关闭
        const h = $pop.data('_closeHandler');
        if (h) __wiRootDoc.removeEventListener('mousedown', h, true);
        $pop.remove();
        return;
      }
      openBatchPopover($(this));
    });

    $container.find('.wi-hu-apply').on('click', () => {
      const selected = [];
      $container.find('.wi-hu-diff-cb:checked').each(function () {
        selected.push(Number($(this).data('idx')));
      });
      if (selected.length === 0) {
        alert('没有勾选任何改动');
        return;
      }
      if (typeof onApply === 'function') onApply(selected);
    });
  }

  // ============================================================
  // [MIGRATE NEW] 迁移新缝合痕迹：extensions 记录 → 名字 [来自...] 后缀
  // ============================================================
  function showMigrateNewConfirmDialog(presetName, preset, targets) {
    const MASK_ID = 'wi_ps_migrate_new_mask';
    __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

    const $mask = $('<div id="' + MASK_ID + '">').css({
      position: 'absolute', inset: 0, background: 'var(--wi-mask-strong)', zIndex: 1000050,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '8px', boxSizing: 'border-box', overflowY: 'auto',
    });
    const $box = $('<div>').addClass('wi-ps-mobile-box').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '10px',
      padding: '18px', width: '720px', maxWidth: '95vw', maxHeight: '92vh',
      overflow: 'auto', color: 'var(--wi-text)', boxShadow: 'var(--SmartThemeShadowColor, 0 12px 40px rgba(0,0,0,.7))',
    });

    let html = `
      <div style="font-size:16px;font-weight:700;color:var(--wi-accent-2);margin-bottom:6px">🔧 迁移新缝合痕迹</div>
      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:14px;line-height:1.7">
        预设：<b style="color:var(--wi-accent)">${escapeHtml(presetName)}</b>
      </div>

      <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:12px;font-size:11px;color:var(--wi-text);line-height:1.7">
        发现 <b style="color:var(--wi-warn)">${targets.length}</b> 条"来源只存在 extensions 里"的新缝合条目。<br>
        迁移会：<br>
        · 把名字后缀<b>加回来</b>（名字变 <code class="wi-code-warn">xxx [来自yyy]</code>）<br>
        · extensions 记录<b>保留不动</b>（两处都有也不影响识别）<br>
        · 迁移后仍能被热更新识别为"🩹 缝合"类
      </div>

      <div style="background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px;padding:8px;margin-bottom:14px;max-height:280px;overflow-y:auto;font-size:11px;line-height:1.7">
        ${targets.map((t, i) => `
          <div style="padding:6px 8px;border-bottom:1px dashed var(--wi-border-soft)">
            <div>#${i + 1} <span style="color:var(--wi-text)">${escapeHtml(t.oldName)}</span></div>
            <div style="color:var(--wi-ok);margin-left:12px">→ ${escapeHtml(t.newName)}</div>
            <div style="color:var(--wi-text-dim);margin-left:12px;font-size:10px">来源：${escapeHtml(t.from)}（来自 extensions 记录）</div>
          </div>
        `).join('')}
      </div>

      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:12px;line-height:1.6">
        ⚠️ 迁移会<b>立即写回预设</b>。写入前会自动备份一份。<br>
        <span style="color:var(--wi-warn)">💡 提示：迁移是双向的，来回点会来回改名字。</span>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button id="wi_ps_mign_cancel" style="${BTN_CSS}">取消</button>
        <button id="wi_ps_mign_run" style="${BTN_PRIMARY_CSS}padding:8px 24px;font-size:13px">✅ 确认迁移（${targets.length} 条）</button>
      </div>
    `;

    $box.html(html);
    $mask.append($box);
    $('#' + PANEL_ID).append($mask);

    $box.find('#wi_ps_mign_cancel').on('click', () => $mask.remove());

    $box.find('#wi_ps_mign_run').on('click', async () => {
      $mask.remove();
      await doMigrateNewSuture(presetName, preset, targets);
    });
  }

  async function doMigrateNewSuture(presetName, preset, targets) {
    const newPreset = JSON.parse(JSON.stringify(preset));

    let count = 0;
    const raw = Array.isArray(newPreset.prompts) ? newPreset.prompts : [];
    targets.forEach(t => {
      const p = raw[t.idx];
      if (!p) return;
      const id = p.identifier || p.id || '';
      if (!id) return;
      // 双保险：再确认一次 extensions 里有记录、名字里没后缀
      const from = newPreset.extensions?.wi_preset_suture_origins?.[id];
      if (!from) return;
      const nm = (p.name || '').trim();
      if (/\[来自.+?\]\s*$/.test(nm)) return;
      p.name = nm + ' [来自' + from + ']';
      count++;
    });

    showLoadingMask('🔧 正在迁移新缝合痕迹…', `共 ${count} 条`);
    await createBackup(presetName, '迁移新缝合');
    let ok = false;
    try {
      ok = await writePreset(presetName, newPreset);
    } finally {
      hideLoadingMask();
    }

    if (ok) {
      if (window.toastr) window.toastr.success(`✅ 已迁移 ${count} 条新缝合痕迹`);
      else alert(`✅ 已迁移 ${count} 条`);

      // 重载
      try {
        const cur = getCurrentPresetName();
        if (cur === presetName && typeof window.loadPreset === 'function') {
          window.loadPreset(cur);
        }
      } catch (e) { }

      // 刷新热更新界面
      renderHotUpdateUI();
    } else {
      alert('❌ 写入失败，看 F12');
    }
  }

  // ============================================================
  // [MIGRATE OLD] 迁移老缝合痕迹：[来自...] 后缀 → extensions 记录
  // ============================================================
  function showMigrateConfirmDialog(presetName, preset, targets) {
    const MASK_ID = 'wi_ps_migrate_mask';
    __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

    const $mask = $('<div id="' + MASK_ID + '">').css({
      position: 'absolute', inset: 0, background: 'var(--wi-mask-strong)', zIndex: 1000050,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '8px', boxSizing: 'border-box', overflowY: 'auto',
    });
    const $box = $('<div>').addClass('wi-ps-mobile-box').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '10px',
      padding: '18px', width: '720px', maxWidth: '95vw', maxHeight: '92vh',
      overflow: 'auto', color: 'var(--wi-text)', boxShadow: 'var(--SmartThemeShadowColor, 0 12px 40px rgba(0,0,0,.7))',
    });

    let html = `
      <div style="font-size:16px;font-weight:700;color:var(--wi-accent-2);margin-bottom:6px">🔧 迁移老缝合痕迹</div>
      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:14px;line-height:1.7">
        预设：<b style="color:var(--wi-accent)">${escapeHtml(presetName)}</b>
      </div>

      <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:12px;font-size:11px;color:var(--wi-text);line-height:1.7">
        发现 <b style="color:var(--wi-warn)">${targets.length}</b> 条名字里带 <code class="wi-code-warn">[来自...]</code> 后缀的条目。<br>
        迁移会：<br>
        · 把名字后缀<b>剥掉</b>（名字变干净）<br>
        · 把来源信息<b>改存到预设的 extensions 里</b>（不污染条目）<br>
        · 迁移后仍能被热更新识别为"🩹 缝合"类
      </div>

      <div style="background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px;padding:8px;margin-bottom:14px;max-height:280px;overflow-y:auto;font-size:11px;line-height:1.7">
        ${targets.map((t, i) => `
          <div style="padding:6px 8px;border-bottom:1px dashed var(--wi-border-soft)">
            <div>#${i + 1} <span style="color:var(--wi-err);text-decoration:line-through">${escapeHtml(t.oldName)}</span></div>
            <div style="color:var(--wi-ok);margin-left:12px">→ ${escapeHtml(t.newName)}</div>
            <div style="color:var(--wi-text-dim);margin-left:12px;font-size:10px">来源：${escapeHtml(t.from)}</div>
          </div>
        `).join('')}
      </div>

      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:12px;line-height:1.6">
        ⚠️ 迁移会<b>立即写回预设</b>。写入前会自动备份一份。
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button id="wi_ps_mig_cancel" style="${BTN_CSS}">取消</button>
        <button id="wi_ps_mig_run" style="${BTN_PRIMARY_CSS}padding:8px 24px;font-size:13px">✅ 确认迁移（${targets.length} 条）</button>
      </div>
    `;

    $box.html(html);
    $mask.append($box);
    $('#' + PANEL_ID).append($mask);

    // （调试已删）
    $box.find('#wi_ps_mig_cancel').on('click', () => $mask.remove());

    $box.find('#wi_ps_mig_run').on('click', async () => {
      $mask.remove();
      await doMigrateOldSuture(presetName, preset, targets);
    });
  }

  async function doMigrateOldSuture(presetName, preset, targets) {
    const newPreset = JSON.parse(JSON.stringify(preset));

    // 确保 extensions 存在
    if (!newPreset.extensions) newPreset.extensions = {};
    if (!newPreset.extensions.wi_preset_suture_origins) {
      newPreset.extensions.wi_preset_suture_origins = {};
    }

    let count = 0;
    const raw = Array.isArray(newPreset.prompts) ? newPreset.prompts : [];
    targets.forEach(t => {
      const p = raw[t.idx];
      if (!p) return;
      // 双保险：再判一次名字，防止中途被改
      const nm = (p.name || '').trim();
      const m = nm.match(/^(.*?)\s*\[来自(.+?)\]\s*$/);
      if (!m) return;
      p.name = m[1].trim();
      const id = p.identifier || p.id || '';
      if (id) {
        newPreset.extensions.wi_preset_suture_origins[id] = m[2].trim();
      }
      count++;
    });

    showLoadingMask('🔧 正在迁移老缝合痕迹…', `共 ${count} 条`);
    await createBackup(presetName, '迁移老缝合');
    let ok = false;
    try {
      ok = await writePreset(presetName, newPreset);
    } finally {
      hideLoadingMask();
    }

    if (ok) {
      if (window.toastr) window.toastr.success(`✅ 已迁移 ${count} 条老缝合痕迹`);
      else alert(`✅ 已迁移 ${count} 条`);

      // 重载
      try {
        const cur = getCurrentPresetName();
        if (cur === presetName && typeof window.loadPreset === 'function') {
          window.loadPreset(cur);
        }
      } catch (e) { }

      // 刷新热更新界面
      renderHotUpdateUI();
    } else {
      alert('❌ 写入失败，看 F12');
    }
  }

  async function applyPresetHotUpdate(targetName, diffs, selectedIdx) {
    // ★ 基底 = 旧预设（a），勾选的新版条目（d）才插进来
    const oldTarget = readPreset(targetName);
    if (!oldTarget) { alert('读取预设失败：' + targetName); return; }

    const newJson = window.__wiLastNewJson;
    if (!newJson || !Array.isArray(newJson.prompts)) {
      alert('未找到新版 JSON 数据，请重新选文件并对比');
      return;
    }

    // ★ 深拷贝旧预设当基底
    const result = JSON.parse(JSON.stringify(oldTarget));

    const fmt = getPresetFormat(oldTarget);
    const oldPromptsRaw = Array.isArray(result.prompts) ? result.prompts : [];
    const oldOrderRaw = Array.isArray(result.prompt_order) ? result.prompt_order : [];

    // ★ 用"有序条目数组"来操作，这样"位置序号"就是数组下标
    //   每条：{ identifier, name, content, enabled, raw }
    function buildOrderedList(preset, prompts, order) {
      const norm = prompts.map(p => {
        if (!p || typeof p !== 'object') return p;
        if (!p.identifier && p.id) return { ...p, identifier: p.id };
        return p;
      }).filter(p => p && typeof p === 'object' && p.identifier);

      const map = new Map();
      norm.forEach(p => map.set(p.identifier, p));

      const out = [];
      const seen = new Set();

      if (Array.isArray(order) && order.length > 0 && Array.isArray(order[0]?.order)) {
        order[0].order.forEach(o => {
          const id = o.identifier || o.id;
          const p = map.get(id);
          if (p && !seen.has(id)) {
            seen.add(id);
            out.push({ identifier: id, name: p.name || '', content: p.content || '', enabled: o.enabled !== false, raw: p });
          }
        });
      } else if (Array.isArray(order) && order.length > 0 && (order[0]?.identifier || order[0]?.id)) {
        order.forEach(o => {
          const id = o.identifier || o.id;
          const p = map.get(id);
          if (p && !seen.has(id)) {
            seen.add(id);
            out.push({ identifier: id, name: p.name || '', content: p.content || '', enabled: o.enabled !== false, raw: p });
          }
        });
      }

      norm.forEach(p => {
        if (!seen.has(p.identifier)) {
          seen.add(p.identifier);
          out.push({ identifier: p.identifier, name: p.name || '', content: p.content || '', enabled: p.enabled !== false, raw: p });
        }
      });

      return out;
    }

    const oldList = buildOrderedList(oldTarget, oldPromptsRaw, oldOrderRaw);

    // ★ 新版的有序列表
    const newPrompts = Array.isArray(newJson.prompts) ? newJson.prompts : [];
    const newOrder = Array.isArray(newJson.prompt_order) ? newJson.prompt_order : [];
    const newList = buildOrderedList(newJson, newPrompts, newOrder);

    // ★ 建立 name -> 新版有序列表下标 的映射（用于计算 d 的位置序号）
    const newIdxByName = new Map();
    const newIdxById = new Map();
    newList.forEach((e, i) => {
      if (e.name && !newIdxByName.has(e.name)) newIdxByName.set(e.name, i);
      if (e.identifier && !newIdxById.has(e.identifier)) newIdxById.set(e.identifier, i);
    });

    // ★ 当前 a 的 identifier 集合（用于判断"是否已存在"）
    const oldIdSet = new Set(oldList.map(e => e.identifier));
    const oldNameMap = new Map();
    oldList.forEach((e, i) => {
      if (e.name && !oldNameMap.has(e.name)) oldNameMap.set(e.name, i);
    });

    // ★ 待插入 / 待修改 的任务
    const toInsert = [];   // { newEntry, insertAt }
    const toModify = [];   // { targetId, newContent, newName, newEnabled }

    let added = 0, merged = 0;

    for (const idx of selectedIdx) {
      const d = diffs[idx];
      if (!d) continue;

      if (d.status === 'added') {
        // ★ 新版有、旧版没有 → 插进来
        const newEntry = newList.find(e =>
          (newIdxByName.get(d.name) !== undefined && e.name === d.name) ||
          (d.newEntry && e.identifier === (d.newEntry.identifier || d.newEntry.id))
        );
        if (!newEntry) {
          console.warn('[热更新] 找不到新版条目：', d.name);
          continue;
        }
        // ★ d 在 b 里的位置序号
        const bIdx = newList.findIndex(e => e.identifier === newEntry.identifier);
        toInsert.push({ newEntry, bIdx });
        added++;

      } else if (d.status === 'modified') {
        // ★ 用新版内容覆盖旧版同名/同 id 那条
        let targetId = null;
        // 先按 identifier 找
        if (d.newEntry) {
          const nid = d.newEntry.identifier || d.newEntry.id;
          if (nid && oldIdSet.has(nid)) targetId = nid;
        }
        // 再按名字找
        if (!targetId) {
          const byNameIdx = oldNameMap.get(d.name);
          if (byNameIdx !== undefined) targetId = oldList[byNameIdx].identifier;
        }
        if (!targetId) {
          console.warn('[热更新] 找不到修改目标：', d.name);
          continue;
        }
        const newContent = d.newEntry ? (d.newEntry.content || '') : (d.newContentRaw || d.newContent || '');
        const newName = d.newEntry ? (d.newEntry.name || d.name) : d.name;
        const newEnabled = d.newEntry ? (d.newEntry.enabled !== false) : (d.newEnabled !== false);
        toModify.push({ targetId, newContent, newName, newEnabled });
        merged++;

      } else if (d.status === 'deleted') {
        // ★ 用户勾了删除 → 从旧版移除
        let targetId = null;
        if (d.oldEntry) {
          const oid = d.oldEntry.identifier || d.oldEntry.id;
          if (oid && oldIdSet.has(oid)) targetId = oid;
        }
        if (!targetId) {
          const byNameIdx = oldNameMap.get(d.name);
          if (byNameIdx !== undefined) targetId = oldList[byNameIdx].identifier;
        }
        if (!targetId) {
          console.warn('[热更新] 找不到删除目标：', d.name);
          continue;
        }
        toInsert.push({ _delete: true, targetId });
      }
    }

    // ============================================================
    // ★ 应用修改（modify）
    // ============================================================
    for (const m of toModify) {
      const entry = oldList.find(e => e.identifier === m.targetId);
      if (!entry) continue;
      entry.content = m.newContent;
      entry.name = m.newName;
      entry.enabled = m.newEnabled;
    }

    // ============================================================
    // ★ 应用插入（insert）：按 b 里的位置序号，从前往后插
    // ============================================================
    // 先处理删除（就地标记）
    const deletedIds = [];
    for (const t of toInsert) {
      if (t._delete) {
        const idx = oldList.findIndex(e => e.identifier === t.targetId);
        if (idx >= 0) oldList.splice(idx, 1);
        deletedIds.push(t.targetId);
      }
    }
    // ★ 从 extensions 里同步移除被删条目的来源记录
    if (deletedIds.length > 0 && result.extensions?.wi_preset_suture_origins) {
      deletedIds.forEach(id => {
        delete result.extensions.wi_preset_suture_origins[id];
      });
    }
    // 再做插入
    const insertions = toInsert.filter(t => !t._delete);
    // 按 bIdx 从小到大排序，保证相对顺序
    insertions.sort((a, b) => a.bIdx - b.bIdx);

    for (const ins of insertions) {
      const src = ins.newEntry;
      const newId = uuid();
      const cloned = JSON.parse(JSON.stringify(src.raw || {}));
      cloned.identifier = newId;
      cloned.id = newId;
      cloned.name = src.name;
      cloned.content = src.content;
      cloned.enabled = src.enabled !== false;

      // ★ 目标位置：取 b 里的序号 bIdx，插到 oldList 的第 bIdx 位（下标从 0 开始）
      //   如果 bIdx 超出 oldList 长度，就放到末尾
      let insertAt = Math.min(ins.bIdx, oldList.length);
      // ★ 但要考虑：d 插进来后，位置序号定义是"第 bIdx 位"
      //   bIdx 是 b 里的下标（0-based），对应"第 bIdx+1 位"
      //   插到 oldList 时，也插到下标 bIdx 位置
      insertAt = Math.max(0, Math.min(insertAt, oldList.length));

      oldList.splice(insertAt, 0, {
        identifier: newId,
        name: src.name,
        content: src.content,
        enabled: src.enabled !== false,
        raw: cloned,
        _isNew: true,
      });
      console.log(`[热更新] 插入「${src.name}」到第 ${insertAt + 1} 位（b 里的序号 ${ins.bIdx + 1}）`);
    }

    // ============================================================
    // ★ 把 oldList 写回预设结构
    // ============================================================
    if (fmt === 'modern') {
      const newPromptsArr = [];
      const newOrderArr = [];
      oldList.forEach(e => {
        let p = e.raw;
        if (e._isNew) {
          p = JSON.parse(JSON.stringify(e.raw));
        } else {
          // ★ 同步 name / content / enabled 到 raw
          p = JSON.parse(JSON.stringify(p));
          p.name = e.name;
          p.content = e.content;
        }
        if (!p.identifier) p.identifier = e.identifier;
        newPromptsArr.push(p);
        newOrderArr.push({ identifier: e.identifier, enabled: e.enabled !== false });
      });
      result.prompts = newPromptsArr;
      if (Array.isArray(result.prompt_order) && result.prompt_order[0]) {
        result.prompt_order[0].order = newOrderArr;
      } else {
        result.prompt_order = [{ character_id: 100001, order: newOrderArr }];
      }
    } else {
      // legacy：直接按 oldList 顺序写 prompts，每条同步 name/content/enabled
      const newPromptsArr = oldList.map(e => {
        const p = JSON.parse(JSON.stringify(e._isNew ? e.raw : e.raw));
        p.identifier = e.identifier;
        p.id = e.identifier;
        p.name = e.name;
        p.content = e.content;
        p.enabled = e.enabled !== false;
        return p;
      });
      result.prompts = newPromptsArr;
    }

    // ============================================================
    // ★ 写入
    // ============================================================
    console.log(`[热更新] 应用：新增 ${added} · 修改 ${merged} → 写回「${targetName}」`);

    await createBackup(targetName, '热更新');
    const ok = await writePreset(targetName, result);
    if (ok) {
      if (window.toastr) window.toastr.success(`✅ 热更新完成：新增 ${added} · 修改 ${merged}`);
      else alert(`✅ 热更新完成\n新增 ${added} · 修改 ${merged}`);
      try {
        const currentName = getCurrentPresetName();
        if (currentName === targetName && typeof window.loadPreset === 'function') {
          window.loadPreset(currentName);
        }
      } catch (e) { }
      refreshPresetList();
    } else {
      alert('❌ 写入失败，看 F12');
    }
  }

  // ============================================================
  // [BACKUP] 预设备份 / 回档
  // ============================================================
  const BACKUP_KEY = 'wi_preset_suture_backups';   // 老 localStorage key（迁移用）
  const BACKUP_MAX_PER_PRESET = 3;                 // 每个预设最多保留几个快照

  // ============================================================
  // [IDB] IndexedDB 封装（替代 localStorage 存备份）
  // ============================================================
  const IDB_NAME = 'wi_preset_suture_db';
  const IDB_STORE = 'backups';
  let __wiIdbPromise = null;

  function openIdb() {
    if (__wiIdbPromise) return __wiIdbPromise;
    __wiIdbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(IDB_NAME, 1);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: 'key' });
          store.createIndex('presetName', 'presetName', { unique: false });
          store.createIndex('ts', 'ts', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return __wiIdbPromise;
  }

  async function idbGetAll() {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(record) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(key) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbClear() {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // ★ 迁移：把老 localStorage 里的备份搬进 IndexedDB（只跑一次）
  async function migrateBackupsFromLocalStorage() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (!raw) return;
      const all = JSON.parse(raw);
      if (!all || typeof all !== 'object') return;
      let count = 0;
      for (const presetName of Object.keys(all)) {
        const list = Array.isArray(all[presetName]) ? all[presetName] : [];
        for (const snap of list) {
          if (!snap || !snap.id) continue;
          await idbPut({
            key: presetName + '||' + snap.id,
            presetName,
            id: snap.id,
            ts: snap.ts || Date.now(),
            action: snap.action || '手动',
            size: snap.size || 0,
            data: snap.data,
          });
          count++;
        }
      }
      // 搬完清空 localStorage（释放空间）
      localStorage.removeItem(BACKUP_KEY);
      if (count > 0) {
        console.log('[预设缝合][备份] ✅ 已从 localStorage 迁移 ' + count + ' 份快照到 IndexedDB');
      }
    } catch (e) {
      console.warn('[预设缝合][备份] 迁移失败（忽略，不影响新功能）:', e);
    }
  }

  // 启动时迁移一次
  migrateBackupsFromLocalStorage();

  // ★ 读取全部备份（按 presetName 分组返回）
  async function loadAllBackups() {
    try {
      const all = await idbGetAll();
      const grouped = {};
      all.forEach(r => {
        if (!r || !r.presetName) return;
        if (!grouped[r.presetName]) grouped[r.presetName] = [];
        grouped[r.presetName].push({
          id: r.id,
          ts: r.ts || 0,
          action: r.action || '手动',
          size: r.size || 0,
          data: r.data,
        });
      });
      // 每个预设按时间降序
      for (const k of Object.keys(grouped)) {
        grouped[k].sort((a, b) => (b.ts || 0) - (a.ts || 0));
      }
      return grouped;
    } catch (e) {
      console.warn('[预设缝合][备份] 读取失败', e);
      return {};
    }
  }

  // ★ 备份瘦身：每个预设最多 BACKUP_MAX_PER_PRESET 份；全局最多 TOTAL_MAX 份
  async function slimBackups() {
    const TOTAL_MAX = 6;
    const all = await idbGetAll();
    if (all.length === 0) return;

    // 1) 按预设分组，超额的砍老
    const byPreset = {};
    all.forEach(r => {
      if (!byPreset[r.presetName]) byPreset[r.presetName] = [];
      byPreset[r.presetName].push(r);
    });
    const toDelete = [];
    for (const presetName of Object.keys(byPreset)) {
      const list = byPreset[presetName];
      list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (list.length > BACKUP_MAX_PER_PRESET) {
        list.slice(BACKUP_MAX_PER_PRESET).forEach(r => toDelete.push(r.key));
      }
    }

    // 2) 全局总量限制
    const remaining = all.filter(r => !toDelete.includes(r.key));
    if (remaining.length > TOTAL_MAX) {
      remaining.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      remaining.slice(TOTAL_MAX).forEach(r => toDelete.push(r.key));
    }

    for (const key of toDelete) {
      try { await idbDelete(key); } catch (e) { }
    }
  }

  // 给某个预设创建一份快照（异步，返回快照 id 或 null）
  async function createBackup(presetName, action) {
    if (!presetName) return null;
    const preset = readPreset(presetName);
    if (!preset) {
      console.warn('[预设缝合][备份] 读不到预设，跳过备份:', presetName);
      return null;
    }

    const snapshot = {
      key: presetName + '||' + uuid(),
      presetName,
      id: null,   // 下面填
      ts: Date.now(),
      action: action || '手动',
      size: JSON.stringify(preset).length,
      data: preset,
    };
    snapshot.id = snapshot.key.split('||')[1];

    try {
      await idbPut(snapshot);
      await slimBackups();
      console.log('[预设缝合][备份] ✅ 已备份「' + presetName + '」（' + (action || '手动') + '，' + snapshot.size + ' 字节）');
      return snapshot.id;
    } catch (e) {
      console.error('[预设缝合][备份] 写入失败', e);
      return null;
    }
  }

  // ★ 列表（现在是异步）
  async function listBackups(presetName) {
    const all = await loadAllBackups();
    return Array.isArray(all[presetName]) ? all[presetName] : [];
  }

  async function deleteBackup(presetName, backupId) {
    try {
      await idbDelete(presetName + '||' + backupId);
      return true;
    } catch (e) {
      console.error('[预设缝合][备份] 删除失败', e);
      return false;
    }
  }

  async function clearBackups(presetName) {
    const list = await listBackups(presetName);
    for (const b of list) {
      try { await idbDelete(presetName + '||' + b.id); } catch (e) { }
    }
    return true;
  }

  async function getBackupData(presetName, backupId) {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(presetName + '||' + backupId);
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => resolve(null);
    });
  }

  function formatBackupTime(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  // ★ 导出所有备份（或指定预设的备份）为文件
  // presetNames: null = 全部；数组 = 只导这几个
  async function exportBackupsToFile(presetNames) {
    const all = await loadAllBackups();
    const out = {
      wi_preset_suture_backups: true,
      exportedAt: Date.now(),
      presets: {},
    };
    if (Array.isArray(presetNames) && presetNames.length > 0) {
      presetNames.forEach(n => {
        if (Array.isArray(all[n]) && all[n].length > 0) {
          out.presets[n] = all[n];
        }
      });
    } else {
      out.presets = all;
    }
    const presetCount = Object.keys(out.presets).length;
    const snapshotCount = Object.values(out.presets).reduce((s, arr) => s + arr.length, 0);
    if (presetCount === 0) {
      alert('没有可导出的备份');
      return;
    }
    const json = JSON.stringify(out, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date();
    const pad = n => String(n).padStart(2, '0');
    const filename = `wi_preset_backups_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (window.toastr) window.toastr.success(`已导出 ${presetCount} 个预设、${snapshotCount} 份快照`);
  }

  // ★ 从文件导入备份
  function importBackupsFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        let parsed;
        try {
          parsed = JSON.parse(String(reader.result || ''));
        } catch (e) {
          alert('❌ JSON 解析失败：' + (e.message || e));
          return;
        }
        if (!parsed || !parsed.wi_preset_suture_backups || typeof parsed.presets !== 'object') {
          alert('❌ 不是有效的备份文件（缺少 wi_preset_suture_backups 标记）');
          return;
        }
        const incomingPresets = Object.keys(parsed.presets);
        if (incomingPresets.length === 0) {
          alert('⚠️ 文件里没有任何备份');
          return;
        }
        const incomingCount = incomingPresets.reduce((s, n) => {
          return s + (Array.isArray(parsed.presets[n]) ? parsed.presets[n].length : 0);
        }, 0);

        const mode = confirm(
          `即将导入 ${incomingPresets.length} 个预设、${incomingCount} 份快照。\n\n` +
          `点「确定」= 合并（同名预设的快照会追加，去重按 id）\n` +
          `点「取消」= 放弃导入`
        );
        if (!mode) return;

        // 拉取现有的（判断重复）
        const existing = await loadAllBackups();
        const existingIdsByPreset = {};
        for (const name of Object.keys(existing)) {
          existingIdsByPreset[name] = new Set(existing[name].map(b => b && b.id).filter(Boolean));
        }

        let merged = 0, skipped = 0;
        for (const name of incomingPresets) {
          const list = Array.isArray(parsed.presets[name]) ? parsed.presets[name] : [];
          if (!existingIdsByPreset[name]) existingIdsByPreset[name] = new Set();
          for (const snap of list) {
            if (!snap || !snap.id) { skipped++; continue; }
            if (existingIdsByPreset[name].has(snap.id)) { skipped++; continue; }
            if (!snap.data || typeof snap.data !== 'object') { skipped++; continue; }
            try {
              await idbPut({
                key: name + '||' + snap.id,
                presetName: name,
                id: snap.id,
                ts: snap.ts || Date.now(),
                action: snap.action || '导入',
                size: snap.size || JSON.stringify(snap.data).length,
                data: snap.data,
              });
              existingIdsByPreset[name].add(snap.id);
              merged++;
            } catch (e) {
              console.warn('[预设缝合][备份] 导入失败', e);
              skipped++;
            }
          }
        }
        await slimBackups();

        if (window.toastr) {
          window.toastr.success(`✅ 已导入 ${merged} 份快照${skipped > 0 ? '（跳过 ' + skipped + ' 份重复/损坏）' : ''}`);
        } else {
          alert(`✅ 已导入 ${merged} 份快照${skipped > 0 ? '\n跳过 ' + skipped + ' 份重复/损坏' : ''}`);
        }
        renderBackupUI();
      };
      reader.onerror = () => alert('❌ 读取文件失败');
      reader.readAsText(file);
    };
    input.click();
  }

  // ============================================================
  // [PRESET API] 预设读写封装
  // ============================================================
  function getAllPresetNames() {
    try {
      if (typeof getPresetNames === 'function') {
        const names = getPresetNames();
        return Array.isArray(names) ? names : [];
      }
    } catch (e) { err('getPresetNames 失败', e); }
    return [];
  }

  function getCurrentPresetName() {
    try {
      if (typeof getLoadedPresetName === 'function') return getLoadedPresetName() || '';
      if (typeof getCurrentPresetName === 'function') return getCurrentPresetName() || '';
    } catch (e) { }
    return '';
  }

  function readPreset(name) {
    try {
      if (typeof getPreset === 'function') return getPreset(name) || null;
    } catch (e) { err('getPreset 失败', name, e); }
    return null;
  }

  async function writePreset(name, data) {
    const promptsCount = Array.isArray(data && data.prompts) ? data.prompts.length : 0;
    const hasOrder = Array.isArray(data && data.prompt_order) && data.prompt_order.length > 0;
    console.log('[缝合器][writePreset] 自检：prompts=' + promptsCount + ' prompt_order=' + (hasOrder ? '有' : '无'));

    // ★ 检查新条目 id 是否重复或为空
    const idCount = {};
    let badIdCount = 0;
    (data.prompts || []).forEach(p => {
      const pid = p && (p.identifier || p.id);
      if (!pid) { badIdCount++; return; }
      idCount[pid] = (idCount[pid] || 0) + 1;
    });
    const dupIds = Object.entries(idCount).filter(([k, v]) => v > 1);
    if (badIdCount > 0 || dupIds.length > 0) {
      const ok = confirm(
        '危险：准备写入的预设里有 ' + badIdCount + ' 条没 id，' + dupIds.length + ' 条 id 重复。\n\n' +
        '这会导致酒馆丢条目！\n\n' +
        '确定要继续吗？（强烈建议取消）'
      );
      if (!ok) return false;
    }

    const isLegacy = !hasOrder;
    if (isLegacy && typeof setPreset === 'function') {
      // ★ legacy 预设：酒馆助手 setPreset 更稳（不会丢 id）
      try {
        await setPreset(name, data);
        console.log('[缝合器][writePreset] ✅ legacy 预设，用 setPreset（酒馆助手）写入成功');
        return true;
      } catch (e) {
        console.warn('[缝合器][writePreset] setPreset 失败，回退 pm.savePreset:', e);
      }
    }

    try {
      const ctx = (window.SillyTavern || (__wiTopWin && __wiTopWin.SillyTavern) || {}).getContext && (window.SillyTavern || __wiTopWin.SillyTavern).getContext();
      if (ctx) {
        const pm = ctx.getPresetManager && ctx.getPresetManager('openai');
        if (pm && typeof pm.savePreset === 'function') {
          await pm.savePreset(name, data);
          console.log('[缝合器][writePreset] 用 pm.savePreset 写入成功');
          return true;
        }
      }
    } catch (e) {
      console.warn('[缝合器][writePreset] pm.savePreset 失败，回退 setPreset:', e);
    }

    try {
      if (typeof setPreset === 'function') {
        await setPreset(name, data);
        console.log('[缝合器][writePreset] 用 setPreset（酒馆助手）写入');
        return true;
      }
      if (typeof replacePreset === 'function') {
        await replacePreset(name, data);
        return true;
      }
    } catch (e) {
      err('[缝合器][writePreset] setPreset/replacePreset 失败', name, e);
    }
    return false;
  }
  function getPrompts(preset) {
    if (!preset) return [];
    return Array.isArray(preset.prompts) ? preset.prompts : [];
  }

  function normalizePrompt(p) {
    if (!p || typeof p !== 'object') return p;
    if (!p.identifier && p.id) return { ...p, identifier: p.id };
    return p;
  }

  function getNormalizedPrompts(preset) {
    const raw = getPrompts(preset);
    return raw.map(normalizePrompt).filter(p => p && typeof p === 'object');
  }

  function getPresetFormat(preset) {
    if (!preset) return 'unknown';
    if (Array.isArray(preset.prompt_order) && preset.prompt_order.length > 0) {
      const hasRealOrder = preset.prompt_order.some(po => Array.isArray(po && po.order) && po.order.length > 0);
      if (hasRealOrder) return 'modern';
    }
    return 'legacy';
  }

  function getPromptOrder(preset) {
    if (!preset) return null;
    const fmt = getPresetFormat(preset);
    if (fmt === 'modern') {
      const po = preset.prompt_order;
      const order = po[0]?.order;
      if (!Array.isArray(order)) return null;
      return order.map(o => ({
        identifier: o.identifier || o.id || '',
        enabled: o.enabled !== false,
      })).filter(o => o.identifier);
    }
    const prompts = getNormalizedPrompts(preset);
    return prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled !== false }));
  }

  function getPromptEnabled(preset, identifier) {
    const fmt = getPresetFormat(preset);
    if (fmt === 'modern') {
      const order = getPromptOrder(preset);
      if (!order) return false;
      const item = order.find(o => o.identifier === identifier);
      return item ? !!item.enabled : false;
    }
    const raw = Array.isArray(preset.prompts) ? preset.prompts : [];
    const p = raw.find(x => (x.identifier || x.id) === identifier);
    return p ? (p.enabled !== false) : false;
  }

  function setPromptEnabled(preset, identifier, enabled) {
    const fmt = getPresetFormat(preset);
    if (fmt === 'modern') {
      const order = getPromptOrder(preset);
      if (!order) return false;
      const item = order.find(o => o.identifier === identifier);
      if (!item) return false;
      item.enabled = !!enabled;
      return true;
    }
    const raw = Array.isArray(preset.prompts) ? preset.prompts : [];
    const p = raw.find(x => (x.identifier || x.id) === identifier);
    if (!p) return false;
    p.enabled = !!enabled;
    return true;
  }

  // ============================================================
  // [STATE] 全局状态
  // ============================================================
  const state = {
    presets: [],
    activePreset: null,
    presetData: null,
    prompts: [],
    promptOrder: [],
    selectedIdentifier: null,
    searchTerm: '',
    sutureSource: null,
    sutureSourceType: 'preset',   // ★ 'preset' | 'worldbook'
    sutureTarget: null,
    sutureSourcePreset: null,
    sutureTargetPreset: null,
    sutureTargetStructure: null,
    sutureManualOverride: { varInitId: null, cotId: null },
    suturePick: {},
    sutureLearnCot: false,
    sutureKeepOrder: false,
    sutureNameSuffix: false,   // ★ 缝合时是否给条目名加 [来自xxx] 后缀
    sutureSourceGroups: [],
    sutureMarkSource: false,
    sutureSearch: '',
    // ★ 粘贴缝合模式（独立，不影响原有逻辑）
    tutorialText: '',
    tutorialSourceNames: [],
    tutorialSourceData: [],
    tutorialRetrievalMode: false,
    pasteMode: false,
    pasteContent: '',
  };

  // ============================================================
  // [UI] 面板构建
  // ============================================================
  const BTN_CSS = 'padding:5px 12px;background:var(--wi-bg-2);color:var(--wi-text);border:1px solid var(--wi-border);border-radius:6px;cursor:pointer;font-size:12px;transition:background .15s;';
  const BTN_PRIMARY_CSS = 'padding:5px 12px;background:var(--wi-accent);color:var(--wi-btn-fg, #fff);border:1px solid var(--wi-accent);border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;';
  const BTN_DANGER_CSS = 'padding:5px 12px;background:var(--wi-err);color:var(--wi-btn-fg, #fff);border:1px solid var(--wi-err);border-radius:6px;cursor:pointer;font-size:12px;';
  const BTN_AI_CSS = 'padding:5px 12px;background:var(--wi-accent-2);color:var(--wi-btn-fg, #fff);border:1px solid var(--wi-accent-2);border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;';
  const INPUT_CSS = 'width:100%;background:var(--wi-bg-0);color:var(--wi-text);border:1px solid var(--wi-border);border-radius:6px;padding:6px 8px;box-sizing:border-box;font-size:12px;outline:none;';
  const LABEL_CSS = 'margin:10px 0 4px;font-size:11px;color:var(--wi-text-dim);';

  // ============================================================
  // [THEME] 多主题系统（可切换）
  // ============================================================
  const WI_THEMES = {
    'ins奶油': `
      --wi-bg-0: #faf8f5; --wi-bg-1: #f3efe9; --wi-bg-2: #eae4db; --wi-bg-3: #ddd5c9;
      --wi-bg-hover: rgba(0,0,0,0.05);
      --wi-text: #3a3530; --wi-text-dim: #8a8178; --wi-text-faint: #b5aca0;
      --wi-border: #ddd5c9; --wi-border-soft: #e8e2d8;
      --wi-accent: #a8927a; --wi-accent-2: #c4a88c;
      --wi-ok: #7d9b76; --wi-warn: #c9a227; --wi-err: #c17a6d;
      --wi-mask: rgba(58,53,48,.45); --wi-mask-strong: rgba(58,53,48,.65);
      --wi-box-bg: #faf8f5;
      --wi-btn-fg: #ffffff;
    `,
    'ins冷淡灰': `
      --wi-bg-0: #f7f7f8; --wi-bg-1: #efeff1; --wi-bg-2: #e4e4e7; --wi-bg-3: #d6d6da;
      --wi-bg-hover: rgba(0,0,0,0.05);
      --wi-text: #2d2d30; --wi-text-dim: #86868b; --wi-text-faint: #b0b0b5;
      --wi-border: #dcdce0; --wi-border-soft: #e8e8ea;
      --wi-accent: #6b7280; --wi-accent-2: #9ca3af;
      --wi-ok: #6b9080; --wi-warn: #b8a04a; --wi-err: #b56b6b;
      --wi-mask: rgba(45,45,48,.45); --wi-mask-strong: rgba(45,45,48,.65);
      --wi-box-bg: #f7f7f8;
      --wi-btn-fg: #ffffff;
    `,
    'ins暗夜': `
      --wi-bg-0: #1c1c1e; --wi-bg-1: #242426; --wi-bg-2: #2c2c2e; --wi-bg-3: #3a3a3c;
      --wi-bg-hover: rgba(255,255,255,0.06);
      --wi-text: #e5e5e7; --wi-text-dim: #98989d; --wi-text-faint: #636366;
      --wi-border: #3a3a3c; --wi-border-soft: #2c2c2e;
      --wi-accent: #d4b499; --wi-accent-2: #c9a68a;
      --wi-ok: #8fae8b; --wi-warn: #d4b26a; --wi-err: #c98a8a;
      --wi-mask: rgba(0,0,0,.55); --wi-mask-strong: rgba(0,0,0,.75);
      --wi-box-bg: #1c1c1e;
      --wi-btn-fg: #1a1a1a;
    `,
    '抹茶': `
      --wi-bg-0: #f4f7f2; --wi-bg-1: #eaf0e6; --wi-bg-2: #dde7d6; --wi-bg-3: #cddcc3;
      --wi-bg-hover: rgba(0,0,0,0.05);
      --wi-text: #2f3a2b; --wi-text-dim: #6f7d68; --wi-text-faint: #a3af9c;
      --wi-border: #cddcc3; --wi-border-soft: #dde7d6;
      --wi-accent: #7d9b6a; --wi-accent-2: #a3b88f;
      --wi-ok: #7d9b6a; --wi-warn: #c9a227; --wi-err: #b56b6b;
      --wi-mask: rgba(47,58,43,.45); --wi-mask-strong: rgba(47,58,43,.65);
      --wi-box-bg: #f4f7f2;
      --wi-btn-fg: #ffffff;
    `,
    '樱花粉': `
      --wi-bg-0: #fdf6f7; --wi-bg-1: #faecef; --wi-bg-2: #f5dde2; --wi-bg-3: #eec9d1;
      --wi-bg-hover: rgba(0,0,0,0.04);
      --wi-text: #4a2f36; --wi-text-dim: #8f6b74; --wi-text-faint: #bfa0a7;
      --wi-border: #eec9d1; --wi-border-soft: #f5dde2;
      --wi-accent: #c98a9b; --wi-accent-2: #dba8b5;
      --wi-ok: #7d9b76; --wi-warn: #c9a227; --wi-err: #c17a6d;
      --wi-mask: rgba(74,47,54,.4); --wi-mask-strong: rgba(74,47,54,.6);
      --wi-box-bg: #fdf6f7;
      --wi-btn-fg: #ffffff;
    `,
    '深海蓝': `
      --wi-bg-0: #f2f6fa; --wi-bg-1: #e6eef6; --wi-bg-2: #d4e2ef; --wi-bg-3: #bdd2e6;
      --wi-bg-hover: rgba(0,0,0,0.05);
      --wi-text: #2b3a4a; --wi-text-dim: #6b7d8f; --wi-text-faint: #9fb0bf;
      --wi-border: #bdd2e6; --wi-border-soft: #d4e2ef;
      --wi-accent: #5b7fa6; --wi-accent-2: #89a8c4;
      --wi-ok: #6b9080; --wi-warn: #c9a227; --wi-err: #b56b6b;
      --wi-mask: rgba(43,58,74,.45); --wi-mask-strong: rgba(43,58,74,.65);
      --wi-box-bg: #f2f6fa;
      --wi-btn-fg: #ffffff;
    `,
    '暗夜蓝': `
      --wi-bg-0: #16191d; --wi-bg-1: #1d2127; --wi-bg-2: #262b33; --wi-bg-3: #333a44;
      --wi-bg-hover: rgba(255,255,255,0.06);
      --wi-text: #dfe4ea; --wi-text-dim: #8b95a3; --wi-text-faint: #5c6570;
      --wi-border: #333a44; --wi-border-soft: #262b33;
      --wi-accent: #7aa2c8; --wi-accent-2: #9dbbd8;
      --wi-ok: #8fae8b; --wi-warn: #d4b26a; --wi-err: #c98a8a;
      --wi-mask: rgba(0,0,0,.55); --wi-mask-strong: rgba(0,0,0,.78);
      --wi-box-bg: #16191d;
      --wi-btn-fg: #1a1a1a;
    `,
    '黑白极简': `
      --wi-bg-0: #ffffff; --wi-bg-1: #f5f5f5; --wi-bg-2: #ebebeb; --wi-bg-3: #dcdcdc;
      --wi-bg-hover: rgba(0,0,0,0.06);
      --wi-text: #111111; --wi-text-dim: #666666; --wi-text-faint: #aaaaaa;
      --wi-border: #dcdcdc; --wi-border-soft: #ebebeb;
      --wi-accent: #111111; --wi-accent-2: #444444;
      --wi-ok: #2e7d32; --wi-warn: #b8860b; --wi-err: #c62828;
      --wi-mask: rgba(0,0,0,.4); --wi-mask-strong: rgba(0,0,0,.65);
      --wi-box-bg: #ffffff;
      --wi-btn-fg: #ffffff;
    `,
  };

  const WI_THEME_KEY = 'wi_preset_suture_theme';

  function getCurrentThemeName() {
    try {
      const t = localStorage.getItem(WI_THEME_KEY);
      if (t && WI_THEMES[t]) return t;
    } catch (e) { }
    return 'ins奶油';
  }

  function applyTheme(name) {
    const themeName = WI_THEMES[name] ? name : 'ins奶油';
    try { localStorage.setItem(WI_THEME_KEY, themeName); } catch (e) { }

    let styleEl = __wiRootDoc.getElementById('wi_ps_theme_vars');
    if (!styleEl) {
      styleEl = __wiRootDoc.createElement('style');
      styleEl.id = 'wi_ps_theme_vars';
      (__wiRootDoc.head || __wiRootDoc.documentElement).appendChild(styleEl);
    }

    styleEl.textContent = `
    /* ★ 统一的 code 样式：所有主题下都清晰 */
    .wi-code {
      background: var(--wi-bg-0);
      color: var(--wi-text);
      border: 1px solid var(--wi-border);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 11px;
    }
    .wi-code-warn {
      background: var(--wi-bg-0);
      color: var(--wi-warn);
      border: 1px solid var(--wi-warn);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 11px;
    }
    .wi-code-accent {
      background: var(--wi-bg-0);
      color: var(--wi-accent);
      border: 1px solid var(--wi-accent);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 11px;
    }
    #wi_preset_suture_panel,
    .wi-ps-mobile-box,
    #wi_preset_suture_panel,
    .wi-ps-mobile-box,
    #wi_ps_modal_mask,
    #wi_ps_diag_mask,
    #wi_ps_diag_result_mask,
    #wi_ps_paste_mask,
    #wi_ps_tutorial_mask,
    #wi_ps_edit_row_mask,
    #wi_ps_cot_rewrite_mask,
    #wi_ps_batch_continue_mask,
    #wi_ps_batch_error_mask,
    #wi_ps_migrate_mask,
    #wi_ps_loading_mask {
      ${WI_THEMES[themeName]}
      --wi-theme-name: "${themeName}";
    }
    #wi_preset_suture_panel,
    #wi_preset_suture_panel *,
    .wi-ps-mobile-box,
    .wi-ps-mobile-box * {
      color-scheme: ${/暗|黑/.test(themeName) ? 'dark' : 'light'};
    }
    #wi_preset_suture_panel select,
    #wi_preset_suture_panel option,
    .wi-ps-mobile-box select,
    .wi-ps-mobile-box option {
      background: var(--wi-bg-0);
      color: var(--wi-text);
    }
    #wi_preset_suture_panel ::placeholder,
    .wi-ps-mobile-box ::placeholder {
      color: var(--wi-text-dim);
      opacity: .7;
    }
    /* ★ 缩放手柄 */
    .wi-resize-edge {
      background: transparent;
      transition: background .15s;
    }
    .wi-resize-edge:hover {
      background: color-mix(in srgb, var(--wi-accent) 40%, transparent);
    }
    /* ★ 主题切换下拉框 */
    #wi_ps_theme_sel {
      background: var(--wi-bg-0);
      color: var(--wi-text);
      border: 1px solid var(--wi-border);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      outline: none;
      margin-right: 4px;
      color-scheme: ${/暗|黑/.test(themeName) ? 'dark' : 'light'};
    }
    /* ★ 黑白极简主题：按钮深底 → 文字强制白色 */
    ${themeName === '黑白极简' ? `
    #wi_preset_suture_panel button[style*="background:var(--wi-accent)"],
    #wi_preset_suture_panel button[style*="background: var(--wi-accent)"],
    #wi_preset_suture_panel button[style*="background:var(--wi-accent-2)"],
    #wi_preset_suture_panel button[style*="background: var(--wi-accent-2)"],
    #wi_preset_suture_panel button[style*="background:var(--wi-err)"],
    #wi_preset_suture_panel button[style*="background: var(--wi-err)"],
    .wi-ps-mobile-box button[style*="background:var(--wi-accent)"],
    .wi-ps-mobile-box button[style*="background: var(--wi-accent)"],
    .wi-ps-mobile-box button[style*="background:var(--wi-accent-2)"],
    .wi-ps-mobile-box button[style*="background: var(--wi-accent-2)"],
    .wi-ps-mobile-box button[style*="background:var(--wi-err)"],
    .wi-ps-mobile-box button[style*="background: var(--wi-err)"] {
      color: #ffffff !important;
    }
    ` : ''}
  `;
  }

  // 启动时立即应用
  applyTheme(getCurrentThemeName());

  // ============================================================
  // [MOBILE FIX] 手机弹窗全局修复
  // ============================================================
  (function injectMobileFix() {
    if (__wiRootDoc.getElementById('wi_ps_mobile_fix')) return;
    const styleEl = __wiRootDoc.createElement('style');
    styleEl.id = 'wi_ps_mobile_fix';
    styleEl.textContent = `
    /* ---- 所有弹窗遮罩：居中 + 可滚 ---- */
    /* ★ 所有弹窗：改为相对面板定位，不再脱离面板飞到屏幕顶 */
    #wi_ps_modal_mask,
    #wi_ps_diag_mask,
    #wi_ps_diag_result_mask,
    #wi_ps_paste_mask,
    #wi_ps_tutorial_mask,
    #wi_ps_edit_row_mask,
    #wi_ps_cot_rewrite_mask,
    #wi_ps_batch_continue_mask,
    #wi_ps_batch_error_mask,
    #wi_ps_migrate_mask,
    #wi_ps_loading_mask {
      position: absolute !important;
      inset: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 8px !important;
      box-sizing: border-box !important;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch !important;
      z-index: 100 !important;
    }
    .wi-ps-mobile-box {
      margin: auto !important;
      max-height: calc(100dvh - 16px) !important;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch !important;
      box-sizing: border-box !important;
    }
    @media (max-width: 820px) {
      #wi_ps_tab_bar {
        overflow-x: auto !important;
        overflow-y: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        flex-wrap: nowrap !important;
        cursor: default !important;
      }
      /* ★ TauriTavern 专用：顶部避让状态栏（硬编码 50px，带 !important 覆盖行内样式） */
      #wi_preset_suture_panel.tt-env {
        padding-top: 50px !important;
        box-sizing: border-box !important;
      }
      #wi_preset_suture_panel.tt-env #wi_ps_tab_bar {
        padding-top: 4px !important;
      }

      .wi-ps-tab {
        padding: 12px 14px !important;
        font-size: 13px !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
      }
      .wi-ps-mobile-box {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 0 !important;
        padding: 12px !important;
        max-height: 100% !important;
      }
      .wi-ps-mobile-box input,
      .wi-ps-mobile-box textarea,
      .wi-ps-mobile-box select,
      #wi_preset_suture_panel input,
      #wi_preset_suture_panel textarea,
      #wi_preset_suture_panel select {
        font-size: 16px !important;
      }
      #wi_preset_suture_panel button,
      .wi-ps-mobile-box button {
        min-height: 36px !important;
        padding: 8px 14px !important;
        font-size: 13px !important;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }
      #wi_ps_tab_list > div:last-child,
      #wi_ps_tab_edit > div:last-child {
        flex-direction: column !important;
      }
      #wi_ps_preset_list,
      #wi_ps_edit_list {
        width: 100% !important;
        max-height: 40vh !important;
        border-right: none !important;
        border-bottom: 1px solid var(--wi-border) !important;
      }
      #wi_ps_preset_detail,
      #wi_ps_edit_detail {
        padding: 10px !important;
      }
      .wi-ps-mobile-box textarea {
        height: 160px !important;
      }
      .wi-ps-review-row > div,
      .wi-ps-paste-review-row > div,
      .wi-ps-tut-review-row > div {
        flex-wrap: wrap !important;
      }
      #wi_ps_magic_entry {
        font-size: 14px !important;
      }
    }
    @media (max-width: 480px) {
      .wi-ps-tab {
        padding: 10px 10px !important;
        font-size: 12px !important;
      }
    }
  `;
    (__wiRootDoc.head || __wiRootDoc.documentElement).appendChild(styleEl);
  })();

  // ============================================================
  // [MAGIC WAND] 魔棒菜单注入
  // ============================================================
  function injectMagicWandEntries() {
    const ENTRIES = [
      { id: 'wi_ps_magic_entry', text: 'psycho缝合', handler: togglePanel, icon: 'fa-solid fa-wand-magic-sparkles', color: 'var(--wi-accent)' },
    ];

    function bindClick($entry, handler) {
      $entry.off('click.wiPS').on('click.wiPS', function (e) {
        e.preventDefault();
        e.stopPropagation();
        // 关闭魔棒菜单
        const $menu = $('#extensionsMenu');
        $menu.hide();
        // 有些版本魔棒用不同的关闭方式
        try {
          if (window.SillyTavern && typeof SillyTavern.hideExtensionsMenu === 'function') {
            SillyTavern.hideExtensionsMenu();
          }
        } catch (_) { }
        handler();
      });
    }

    function tryInject() {
      // ★ 兼容不同版本的魔棒菜单 id
      const selectors = ['#extensionsMenu', '#extensions-menu', '#extensions-dropdown'];
      let $menu = $();
      for (const sel of selectors) {
        const $c = $(sel);
        if ($c.length) { $menu = $c.first(); break; }
      }
      if (!$menu.length) return false;

      ENTRIES.forEach(entry => {
        const $exists = $menu.find('#' + entry.id);
        if ($exists.length) {
          bindClick($exists, entry.handler);
          return;
        }
        const $el = $(
          '<a id="' + entry.id + '" class="list-group-item" href="javascript:void(0)">' +
          '<i class="' + entry.icon + '" style="color:' + entry.color + ';margin-right:6px;"></i>' +
          '<span>' + entry.text + '</span>' +
          '</a>'
        );
        bindClick($el, entry.handler);
        $menu.append($el);
      });
      return true;
    }

    tryInject();
    setTimeout(tryInject, 800);
    setTimeout(tryInject, 2000);
    setTimeout(tryInject, 4000);

    if (typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(() => { tryInject(); });
      try {
        mo.observe(__wiRootDoc.body, { childList: true, subtree: true });
      } catch (e) {
        mo.observe(document.body, { childList: true, subtree: true });
      }
    }

    log('[魔棒] 已注入魔棒菜单条目');
  }

  function buildUI() {
    if (__wiRootDoc.getElementById(PANEL_ID)) return;

    // 只走魔棒菜单，不再区分电脑/手机
    injectMagicWandEntries();

    const $panel = $(`
    <div id="${PANEL_ID}" style="display:none;position:fixed;right:0;left:0;top:0;bottom:0;width:100vw;height:100dvh;
    background:var(--wi-box-bg);color:var(--wi-text);border:none;border-radius:0;z-index:9996;
    flex-direction:column;overflow:hidden;box-shadow:var(--SmartThemeShadowColor, 0 12px 40px rgba(0,0,0,.5))">

      <div id="wi_ps_tab_bar" style="padding:0;border-bottom:1px solid var(--wi-border);background:var(--wi-bg-1);display:flex;gap:0;flex-shrink:0;align-items:center;cursor:default;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;flex-wrap:nowrap">
        <span id="wi_ps_version_badge" title="点击查看版本详情" style="padding:0 10px 0 14px;font-size:12px;color:var(--wi-text-dim);font-weight:600;letter-spacing:0.5px;user-select:none;border-right:1px solid var(--wi-border);margin-right:4px;white-space:nowrap;cursor:pointer">
          psycho缝合
          <span style="font-weight:400;font-size:10px;color:var(--wi-text-faint);margin-left:4px">${WI_INSTANCE_ID.includes('-tt') ? 'TT' : ''} v${WI_VERSION}</span>
        </span>
        <div class="wi-ps-tab" data-tab="list" style="padding:10px 16px;cursor:pointer;font-size:12px;color:var(--wi-accent);border-bottom:2px solid var(--wi-accent);transition:all .15s;user-select:none;white-space:nowrap;flex-shrink:0">📋 预设列表</div>
        <div class="wi-ps-tab" data-tab="edit" style="padding:10px 16px;cursor:pointer;font-size:12px;color:var(--wi-text-dim);border-bottom:2px solid transparent;transition:all .15s;user-select:none;white-space:nowrap;flex-shrink:0">✏️ 条目编辑</div>
        <div class="wi-ps-tab" data-tab="suture" style="padding:10px 16px;cursor:pointer;font-size:12px;color:var(--wi-text-dim);border-bottom:2px solid transparent;transition:all .15s;user-select:none;white-space:nowrap;flex-shrink:0">🔗 缝合模式</div>
        <div class="wi-ps-tab" data-tab="hotupdate" style="padding:10px 16px;cursor:pointer;font-size:12px;color:var(--wi-text-dim);border-bottom:2px solid transparent;transition:all .15s;user-select:none;white-space:nowrap;flex-shrink:0">🔄 热更新</div>
        <div class="wi-ps-tab" data-tab="backup" style="padding:10px 16px;cursor:pointer;font-size:12px;color:var(--wi-text-dim);border-bottom:2px solid transparent;transition:all .15s;user-select:none;white-space:nowrap;flex-shrink:0">💾 备份</div>
        <span style="flex:1"></span>
        <select id="wi_ps_theme_sel" title="切换主题"></select>
        <button id="wi_ps_close" style="padding:5px 10px;background:var(--wi-bg-2);color:var(--wi-text);border:1px solid var(--wi-border);border-radius:6px;cursor:pointer;font-size:12px;margin:6px 8px 6px 2px;position:sticky;right:0;z-index:2;flex-shrink:0">✕</button>
      </div>

      <div id="wi_ps_tab_list" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
        <div style="padding:8px;border-bottom:1px solid var(--wi-border);display:flex;gap:8px;align-items:center;background:var(--wi-bg-1);flex-wrap:wrap">
          <button id="wi_ps_refresh_list" style="${BTN_CSS}">🔄 刷新预设列表</button>
          <button id="wi_ps_new_preset" style="${BTN_PRIMARY_CSS}">＋ 新建空白预设</button>
          <button id="wi_ps_dup_preset" style="${BTN_CSS}">📋 复制选中</button>
          <span style="flex:1"></span>
          <span id="wi_ps_list_count" style="font-size:11px;color:var(--wi-text-dim)">0 个预设</span>
        </div>
        <div style="display:flex;flex:1;overflow:hidden">
          <div id="wi_ps_preset_list" style="width:260px;overflow-y:auto;border-right:1px solid var(--wi-border);background:var(--wi-bg-1)"></div>
          <div id="wi_ps_preset_detail" style="flex:1;padding:14px;overflow-y:auto">
            <div style="color:var(--wi-text-dim);text-align:center;padding:60px 20px;font-size:13px">
              <div style="font-size:32px;margin-bottom:12px">📋</div>
              <div>从左侧选一个预设查看详情</div>
            </div>
          </div>
        </div>
      </div>

      <div id="wi_ps_tab_edit" style="display:none;flex-direction:column;flex:1;overflow:hidden">
        <div style="padding:8px;border-bottom:1px solid var(--wi-border);display:flex;gap:8px;align-items:center;background:var(--wi-bg-1);flex-wrap:wrap">
          <span style="font-size:12px;color:var(--wi-text);white-space:nowrap">预设</span>
          <select id="wi_ps_edit_preset_select" style="${INPUT_CSS}flex:1;min-width:150px;color-scheme:var(--SmartThemeColorScheme, dark)"></select>
          <input id="wi_ps_edit_search" placeholder="🔍 筛选条目名" style="${INPUT_CSS}flex:1;min-width:120px">
          <button id="wi_ps_edit_refresh" style="${BTN_CSS}">🔄 重载</button>
          <span id="wi_ps_edit_count" style="font-size:11px;color:var(--wi-text-dim);white-space:nowrap">0 条</span>
        </div>
        <div style="display:flex;flex:1;overflow:hidden">
          <div id="wi_ps_edit_list" style="width:280px;overflow-y:auto;border-right:1px solid var(--wi-border);background:var(--wi-bg-1)"></div>
          <div id="wi_ps_edit_detail" style="flex:1;padding:14px;overflow-y:auto">
            <div style="color:var(--wi-text-dim);text-align:center;padding:60px 20px;font-size:13px">
              <div style="font-size:32px;margin-bottom:12px">✏️</div>
              <div>从左侧选一个条目编辑</div>
            </div>
          </div>
        </div>
      </div>

      <div id="wi_ps_tab_suture" style="display:none;flex-direction:column;flex:1;overflow:hidden">
        <div id="wi_ps_suture_content" style="flex:1;overflow-y:auto;padding:14px">
          <div style="color:var(--wi-text-dim);text-align:center;padding:60px 20px;font-size:13px">
            <div style="font-size:32px;margin-bottom:12px">🔗</div>
            <div>缝合模式（下一步开发）</div>
          </div>
        </div>
      </div>

      <div id="wi_ps_tab_hotupdate" style="display:none;flex-direction:column;flex:1;overflow:hidden">
        <div id="wi_ps_hotupdate_content" style="flex:1;overflow-y:auto;padding:14px">
          <div style="color:var(--wi-text-dim);text-align:center;padding:60px 20px;font-size:13px">
            <div style="font-size:32px;margin-bottom:12px">🔄</div>
            <div>热更新</div>
          </div>
        </div>
      </div>

      <div id="wi_ps_tab_backup" style="display:none;flex-direction:column;flex:1;overflow:hidden">
        <div id="wi_ps_backup_content" style="flex:1;overflow-y:auto;padding:14px"></div>
      </div>

    </div>`);
    $('body').append($panel);

    // ★ TauriTavern：给面板加类，触发顶部避让
    if (isTauriTavernEnv()) {
      const panelEl = __wiRootDoc.getElementById(PANEL_ID);
      if (panelEl) {
        panelEl.classList.add('tt-env');
        console.log('[psycho缝合] 检测到 TauriTavern，已启用顶部避让');
        // 调试：打印注入的 inset 值
        try {
          const v = getComputedStyle(document.documentElement).getPropertyValue('--tt-inset-top');
          console.log('[psycho缝合] --tt-inset-top =', JSON.stringify(v));
        } catch (e) { }
      }
    }

    $('.wi-ps-tab').on('click', function () {
      const tab = $(this).data('tab');
      $('.wi-ps-tab').each(function () {
        const t = $(this).data('tab');
        if (t === tab) {
          $(this).css({ color: 'var(--wi-accent)', borderBottomColor: 'var(--wi-accent)' });
          $(`#wi_ps_tab_${t}`).css('display', 'flex');
        } else {
          $(this).css({ color: 'var(--wi-text-dim)', borderBottomColor: 'transparent' });
          $(`#wi_ps_tab_${t}`).css('display', 'none');
        }
      });
      if (tab === 'list') refreshPresetList();
      if (tab === 'edit') refreshEditTab();
      if (tab === 'suture') refreshSutureTab();
      if (tab === 'hotupdate') refreshHotUpdateTab();
      if (tab === 'backup') refreshBackupTab();
    });

    // ★ 版本徽章：点击查看详情
    $('#wi_ps_version_badge').on('click', () => {
      const envLabel = WI_INSTANCE_ID.includes('-tt') ? 'TauriTavern 特供版' : '通用版';
      const ts = new Date(__wiInstanceInfo.ts);
      const pad = n => String(n).padStart(2, '0');
      const tsStr = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`;
      alert(
        'psycho缝合\n\n' +
        '版本：v' + WI_VERSION + '\n' +
        '环境：' + envLabel + '\n' +
        '实例 ID：' + WI_INSTANCE_ID + '\n' +
        '加载时间：' + tsStr + '\n' +
        '运行环境：' + (isTauriTavernEnv() ? 'TauriTavern' : '浏览器')
      );
    });

    $('#wi_ps_close').on('click', () => $('#' + PANEL_ID).hide());
    $('#wi_ps_refresh_list').on('click', refreshPresetList);
    $('#wi_ps_new_preset').on('click', createNewPreset);
    $('#wi_ps_dup_preset').on('click', duplicatePreset);
    $('#wi_ps_edit_refresh').on('click', refreshEditTab);
    $('#wi_ps_edit_preset_select').on('change', function () {
      const name = $(this).val();
      if (name) loadPresetForEdit(name);
    });
    $('#wi_ps_edit_search').on('input', function () {
      state.searchTerm = $(this).val() || '';
      renderEditList();
    });

    // ★ 初始化主题下拉框
    (function initThemeSelector() {
      const $sel = $('#wi_ps_theme_sel');
      Object.keys(WI_THEMES).forEach(name => {
        $sel.append($('<option>').val(name).text('🎨 ' + name));
      });
      $sel.val(getCurrentThemeName());
      $sel.on('change', function () {
        applyTheme($(this).val());
        if (window.toastr) window.toastr.success('主题已切换：' + $(this).val());
      });
    })();

    bindPanelDrag();
    bindPanelResize();
    log('UI 构建完成');
  }

  function togglePanel() {
    const $p = $('#' + PANEL_ID);
    if ($p.is(':visible')) {
      $p.hide();
    } else {
      $p.css({ display: 'flex', flexDirection: 'column' });
      refreshPresetList();
    }
  }

  // ============================================================
  // [TAB 1] 预设列表
  // ============================================================
  function refreshPresetList() {
    state.presets = getAllPresetNames();
    log('预设列表刷新：', state.presets.length, '个');

    const $list = $('#wi_ps_preset_list').empty();
    $('#wi_ps_list_count').text(`${state.presets.length} 个预设`);

    if (state.presets.length === 0) {
      $list.append('<div style="color:var(--wi-text-dim);text-align:center;padding:30px;font-size:12px">没有读取到预设</div>');
      return;
    }

    const currentName = getCurrentPresetName();

    state.presets.forEach(name => {
      const isCurrent = name === currentName;
      const isSelected = name === state.activePreset;
      const $item = $(`
        <div class="wi-ps-preset-item" data-name="${escapeHtml(name)}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--wi-border-soft);background:${isSelected ? 'var(--wi-bg-3)' : 'transparent'}">
          <div style="font-size:12px;color:${isCurrent ? 'var(--wi-ok)' : 'var(--wi-text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${isCurrent ? '● ' : ''}${escapeHtml(name)}
          </div>
        </div>
      `);
      $item.on('click', () => {
        state.activePreset = name;
        refreshPresetList();
        renderPresetDetail(name);
      });
      $list.append($item);
    });

    if (state.activePreset && state.presets.includes(state.activePreset)) {
      renderPresetDetail(state.activePreset);
    }
  }

  // ============================================================
  // [DIAGNOSE] 预设诊断与调整
  // ============================================================
  function buildDiagnoseEntriesPayload(preset, opts) {
    const entries = extractOrderedEntries(preset);
    const skipCot = opts && opts.skipCot;
    const onlyEnabled = opts && opts.onlyEnabled;

    // 找 COT 区（从 extensions 里读，没有就算了）
    let cotIds = new Set();
    const savedZones = preset?.extensions?.wi_preset_suture_zones;
    if (skipCot && Array.isArray(savedZones) && savedZones.length > 0) {
      const idToIdx = new Map();
      entries.forEach((e, i) => idToIdx.set(e.identifier, i));
      savedZones.forEach(z => {
        if (z.zoneType !== 'cot') return;
        const sIdx = idToIdx.get(z.startId);
        const eIdx = idToIdx.get(z.endId);
        if (sIdx === undefined || eIdx === undefined) return;
        for (let i = sIdx; i <= eIdx && i < entries.length; i++) {
          cotIds.add(entries[i].identifier);
        }
      });
    }

    const blocks = [];
    let sentCount = 0;
    let skippedDisabled = 0;
    let skippedCot = 0;

    entries.forEach((e, i) => {
      const enabled = e.enabled !== false;
      const isCot = cotIds.has(e.identifier);

      if (onlyEnabled && !enabled) {
        blocks.push(`${i + 1}. [禁用] ${e.name}`);
        skippedDisabled++;
        return;
      }
      if (isCot) {
        blocks.push(`${i + 1}. [COT-跳过] ${e.name}`);
        skippedCot++;
        return;
      }

      sentCount++;
      const flag = enabled ? '[启用]' : '[禁用]';
      blocks.push(`${i + 1}. ${flag} ${e.name}\n内容：\n${e.prompt.content || ''}`);
    });

    return {
      text: blocks.join('\n\n---\n\n'),
      sentCount,
      skippedDisabled,
      skippedCot,
      totalCount: entries.length,
      entries,
    };
  }

  async function aiDiagnosePreset(preset, question, sampleOutput, opts, history) {
    if (!isAiConfigReady()) return { diagnosis: '', changes: [], error: '未配置 AI' };

    const payload = buildDiagnoseEntriesPayload(preset, opts);

    const sysPrompt = `你是 SillyTavern 预设诊断与调整助手。

用户会给你：
1. 一个完整预设的所有条目（名字 + 内容 + 启用状态）
2. 用户想解决的问题（可能为空）
3. 用户提供的实际输出样本（可能为空，也可能很长）

你的任务：
A. 诊断：分析预设里哪些条目、哪些规则导致了用户描述的问题（或者整体上有什么可优化之处）。
B. 给出修改方案：明确指出要改哪些条目（改内容）或新增哪些条目。

【修改规则 - 必须严格遵守】

1. action 只有两种："modify" 和 "add"。**不允许删除条目**。
2. "modify" 的 entryName 必须跟预设里的条目名**一字不差**（包括 emoji、空格、标点）。
3. "modify" 的 newContent 必须是**完整的新内容**，不是片段，不是 diff。
4. "modify" 时必须**保留原内容里所有的变量语法**（{{setvar::}}、{{getvar::}}、{{变量}}）和特殊标签（<>、HTML 注释等），除非用户明确要求改这些。
5. "add" 的 insertAfter 必须是预设里**已存在的条目名**（一字不差）。如果实在没合适的锚点，填 "__LAST__"。
6. "add" 的 content 是完整的新条目内容。
7. 不要改动与用户问题无关的条目。改动越少越好，精准打击。
8. 如果用户问题需要改多个条目才能解决，可以给多条 modify/add。
9. 如果用户没提问题（空），就做整体体检，只提**最关键的 2~5 条**改进建议，不要贪多。

【输出格式 - 只返回 JSON，无其他文字】

{
  "diagnosis": "（诊断分析，可以多段，用 \\n 换行）",
  "changes": [
    {
      "action": "modify",
      "entryName": "文风-主规则",
      "reason": "把'强烈的情感'改为克制表达",
      "newContent": "（完整新内容）"
    },
    {
      "action": "add",
      "entryName": "情绪克制约束",
      "reason": "新增一条抑制过度情绪化的规则",
      "content": "（新条目内容）",
      "insertAfter": "文风-主规则"
    }
  ]
}

⚠️ 内容里的换行用 \\n 表示。⚠️ 如果不需要任何改动，changes 返回空数组。`;

    const userParts = [];
    userParts.push('【当前预设条目】\n\n' + payload.text);
    userParts.push('【用户的问题】\n' + (question && question.trim() ? question.trim() : '（用户未指定，请做整体体检，只提最关键的 2~5 条建议）'));
    if (sampleOutput && sampleOutput.trim()) {
      userParts.push('【用户提供的实际输出样本】\n' + sampleOutput.trim());
    }

    // ★ 多轮：拼接历史对话
    if (Array.isArray(history) && history.length > 0) {
      const historyBlocks = history.map((h, i) => {
        return `【第 ${i + 1} 轮追问】用户：${h.user}\n\nAI 上一轮回答（诊断+建议）：\n${h.aiRaw}`;
      }).join('\n\n---\n\n');
      userParts.push('【历史对话（你已经答过的，用户又追加了新问题）】\n\n' + historyBlocks);
      userParts.push('⚠️ 注意：用户在第 ' + (history.length + 1) + ' 轮又提了新要求。请**只针对新要求**给出诊断和修改建议。\n' +
        '如果新要求跟历史里的某条修改建议冲突，以新要求为准。\n' +
        '如果新要求已经被历史建议覆盖过了，可以不重复给。');
    }

    try {
      console.log('[诊断] ===== 发起请求 =====');
      console.log('[诊断] 发送条目数:', payload.sentCount, ' 跳过禁用:', payload.skippedDisabled, ' 跳过COT:', payload.skippedCot);
      console.log('[诊断] 完整 user prompt 长度:', userParts.join('\n\n').length);

      const content = await callAuxApi(
        [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userParts.join('\n\n') },
        ],
        { temperature: 0.4, max_tokens: 40000 }
      );

      console.log('[诊断] ===== 返回 =====');
      console.log('[诊断原始返回]', content);

      const parsed = extractJsonFromAI(content);
      if (parsed && typeof parsed.diagnosis === 'string') {
        return {
          diagnosis: parsed.diagnosis,
          changes: Array.isArray(parsed.changes) ? parsed.changes : [],
          payload,
          error: null,
          raw: content,
        };
      }
      return { diagnosis: '', changes: [], payload, error: 'AI 返回格式无法解析', raw: content };
    } catch (e) {
      return { diagnosis: '', changes: [], payload, error: '请求失败：' + (e.message || e), raw: '' };
    }
  }

  function showDiagnoseDialog() {
    if (!state.activePreset) { alert('请先选一个预设'); return; }
    const preset = readPreset(state.activePreset);
    if (!preset) { alert('读取预设失败'); return; }
    if (!isAiConfigReady()) { alert('未配置 AI。请先到「🔗 缝合模式」tab 底部填 API 配置。'); return; }

    const MASK_ID = 'wi_ps_diag_mask';
    __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

    const entryCount = extractOrderedEntries(preset).length;

    const $mask = $('<div id="' + MASK_ID + '">').css({
      position: 'fixed', inset: 0, background: 'var(--wi-mask-strong)', zIndex: 1000050,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    const $box = $('<div>').addClass('wi-ps-mobile-box').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '10px',
      padding: '18px', width: '820px', maxWidth: '95vw', maxHeight: '92vh',
      overflow: 'auto', color: 'var(--wi-text)', boxShadow: 'var(--SmartThemeShadowColor, 0 12px 40px rgba(0,0,0,.7))',
    });

    let html = `
      <div style="font-size:16px;font-weight:700;color:var(--wi-accent-2);margin-bottom:6px">🩺 诊断与调整</div>
      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:14px;line-height:1.7">
        当前预设：<b style="color:var(--wi-accent)">${escapeHtml(state.activePreset)}</b>（${entryCount} 条）
      </div>

      <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:14px;font-size:11px;color:var(--wi-text);line-height:1.7">
        <b style="color:var(--wi-accent-2)">用法：</b>把整个预设发给 AI，让它诊断问题并给出修改方案。<br>
        · AI 只能"改内容"和"加条目"，<b style="color:var(--wi-warn)">不能删条目</b><br>
        · 改完会显示差异，你逐条确认后才写入<br>
        · 越具体的问题（+贴一段实际输出）→ 诊断越准
      </div>

      <div style="margin:10px 0 4px;font-size:11px;color:var(--wi-text-dim)">① 你想解决什么问题？（可留空 = 整体体检）</div>
      <textarea id="wi_ps_diag_q" placeholder="例：正文情绪太激烈，希望 AI 输出更克制、不要动不动就哭着喊着告白&#10;例：角色说话太像 AI，不够自然&#10;例：（留空，让 AI 整体体检）" style="${INPUT_CSS}height:90px;resize:vertical;font-family:inherit;font-size:12px;line-height:1.6"></textarea>

      <div style="margin:10px 0 4px;font-size:11px;color:var(--wi-text-dim)">② 贴一段你觉得不满意的实际输出（可选，但强烈建议）</div>
      <textarea id="wi_ps_diag_sample" placeholder="把觉得有问题的正文粘到这里。AI 会结合「现象 + 规则」一起诊断" style="${INPUT_CSS}height:160px;resize:vertical;font-family:monospace;font-size:11px;line-height:1.5"></textarea>

      <div style="margin:14px 0 4px;font-size:11px;color:var(--wi-text-dim)">③ 范围</div>
      <div style="display:flex;flex-direction:column;gap:6px;padding:8px 10px;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px">
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--wi-text);cursor:pointer">
          <input type="checkbox" id="wi_ps_diag_only_enabled" checked>
          <span>只分析已启用的条目（禁用的条目只列名字，不发内容）</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--wi-text);cursor:pointer">
          <input type="checkbox" id="wi_ps_diag_skip_cot" checked>
          <span>跳过 COT 区（COT 太敏感，避免 AI 乱改；关掉则把 COT 也发给它）</span>
        </label>
      </div>

      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button id="wi_ps_diag_cancel" style="${BTN_CSS}">取消</button>
        <button id="wi_ps_diag_run" style="${BTN_AI_CSS}padding:8px 24px;font-size:13px">🩺 开始诊断</button>
      </div>

      <div id="wi_ps_diag_status" style="margin-top:12px;font-size:12px;color:var(--wi-text-dim)"></div>
    `;

    $box.html(html);
    $mask.append($box);
    $('#' + PANEL_ID).append($mask);

    const $status = $box.find('#wi_ps_diag_status');

    $box.find('#wi_ps_diag_cancel').on('click', () => $mask.remove());

    $box.find('#wi_ps_diag_run').on('click', async () => {
      const question = $box.find('#wi_ps_diag_q').val() || '';
      const sample = $box.find('#wi_ps_diag_sample').val() || '';
      const onlyEnabled = $box.find('#wi_ps_diag_only_enabled').is(':checked');
      const skipCot = $box.find('#wi_ps_diag_skip_cot').is(':checked');

      // 预估一下发送量
      const preview = buildDiagnoseEntriesPayload(preset, { onlyEnabled, skipCot });
      const totalChars = preview.text.length + question.length + sample.length;
      const ok = confirm(
        `即将发送给 AI：\n` +
        `· 条目：${preview.sentCount} 条\n` +
        `· 字符数：约 ${totalChars.toLocaleString()}\n\n` +
        `确认继续？`
      );
      if (!ok) return;

      $status.html('⏳ AI 正在诊断…').css('color', 'var(--wi-accent)');
      showLoadingMask(
        '🩺 AI 正在诊断预设…',
        `已发送 ${preview.sentCount} 条。可能需要 30~120 秒。请勿刷新页面。`
      );

      let result;
      try {
        result = await aiDiagnosePreset(preset, question, sample, { onlyEnabled, skipCot });
      } finally {
        hideLoadingMask();
      }

      if (result.error) {
        $status.html('❌ 诊断失败：' + escapeHtml(result.error)).css('color', 'var(--wi-err)');
        if (result.raw) console.error('[诊断] 原始返回:', result.raw);
        return;
      }

      $mask.remove();
      showDiagnoseResultDialog(result, preset, question, sample, { onlyEnabled, skipCot });
    });
  }

  function showDiagnoseResultDialog(result, preset, initialQuestion, initialSample, opts) {
    const MASK_ID = 'wi_ps_diag_result_mask';
    __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

    // ★ 状态：多轮
    const diagState = {
      preset,
      opts,
      rounds: [],           // [{ question, sample, diagnosis, changes: [] }]
      allChanges: [],       // 累积的全部建议（已经渲染顺序）
      history: [],          // [{ user, aiRaw }]，给 AI 用
      roundIdx: 0,
    };

    const entries = extractOrderedEntries(preset);
    const entryByName = new Map();
    entries.forEach(e => {
      if (!entryByName.has(e.name)) entryByName.set(e.name, e);
    });

    // ★ 校验并规范化一批 changes
    function normalizeChanges(rawChanges, roundLabel) {
      const out = [];
      (rawChanges || []).forEach((c) => {
        if (!c || !c.action) return;
        if (c.action === 'modify') {
          const target = entryByName.get(c.entryName);
          if (!target) {
            out.push({ _invalid: true, reason: `找不到条目「${c.entryName}」`, raw: c, _round: roundLabel });
            return;
          }
          out.push({
            action: 'modify',
            entryName: c.entryName,
            entryId: target.identifier,
            reason: c.reason || '',
            oldContent: target.prompt.content || '',
            newContent: String(c.newContent || ''),
            _round: roundLabel,
          });
        } else if (c.action === 'add') {
          out.push({
            action: 'add',
            entryName: c.entryName || '新条目',
            reason: c.reason || '',
            content: String(c.content || ''),
            insertAfter: c.insertAfter || '__LAST__',
            _round: roundLabel,
          });
        }
      });
      return out;
    }

    // ★ 把某轮结果合并进 allChanges
    function mergeRoundChanges(roundLabel, newChanges) {
      newChanges.forEach(nc => {
        if (nc._invalid) {
          diagState.allChanges.push(nc);
          return;
        }
        if (nc.action === 'modify') {
          // 如果已有同 entryName 的 modify 建议，覆盖（以新轮为准）
          const existIdx = diagState.allChanges.findIndex(c =>
            c && !c._invalid && c.action === 'modify' && c.entryName === nc.entryName
          );
          if (existIdx >= 0) {
            diagState.allChanges[existIdx] = nc;
            nc._overwritten = true;
            return;
          }
        }
        diagState.allChanges.push(nc);
      });
    }

    // 第一轮
    const round1Label = '第 1 轮';
    const round1Changes = normalizeChanges(result.changes, round1Label);
    diagState.rounds.push({
      question: initialQuestion || '',
      sample: initialSample || '',
      diagnosis: result.diagnosis || '',
      changes: round1Changes,
    });
    mergeRoundChanges(round1Label, round1Changes);
    diagState.history.push({
      user: initialQuestion && initialQuestion.trim() ? initialQuestion.trim() : '（整体体检）',
      aiRaw: result.raw || JSON.stringify({ diagnosis: result.diagnosis, changes: result.changes }, null, 2),
    });

    // ============================================================
    // UI
    // ============================================================
    const $mask = $('<div id="' + MASK_ID + '">').css({
      position: 'fixed', inset: 0, background: 'var(--wi-mask-strong)', zIndex: 1000050,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    const $box = $('<div>').addClass('wi-ps-mobile-box').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '10px',
      padding: '18px', width: '920px', maxWidth: '95vw', maxHeight: '92vh',
      overflow: 'hidden', color: 'var(--wi-text)', boxShadow: 'var(--SmartThemeShadowColor, 0 12px 40px rgba(0,0,0,.7))',
      display: 'flex', flexDirection: 'column',
    });

    $box.html(`
      <div style="font-size:16px;font-weight:700;color:var(--wi-accent-2);margin-bottom:10px;flex-shrink:0">🩺 诊断结果（多轮）</div>
      <div id="wi_ps_diag_scroll" style="flex:1;overflow-y:auto;padding-right:6px;min-height:200px"></div>
      <div style="flex-shrink:0;margin-top:12px;border-top:1px solid var(--wi-border);padding-top:10px">
        <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:4px">💬 继续追问（可选）</div>
        <textarea id="wi_ps_diag_followup" placeholder="例：那再帮我把「字数限制」也改一下&#10;例：为什么 xxx 还是没效果？" style="${INPUT_CSS}height:60px;resize:vertical;font-family:inherit;font-size:12px;line-height:1.6"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap">
          <div style="display:flex;gap:6px">
            <button id="wi_ps_diag_all" style="${BTN_CSS}font-size:11px">全选</button>
            <button id="wi_ps_diag_none" style="${BTN_CSS}font-size:11px">全不选</button>
          </div>
          <div style="display:flex;gap:8px">
            <button id="wi_ps_diag_cancel" style="${BTN_CSS}">取消</button>
            <button id="wi_ps_diag_followup_btn" style="${BTN_AI_CSS}">💬 追问</button>
            <button id="wi_ps_diag_apply" style="${BTN_PRIMARY_CSS}padding:8px 24px;font-size:13px">✅ 应用选中的改动</button>
          </div>
        </div>
        <div id="wi_ps_diag_status" style="margin-top:6px;font-size:11px;color:var(--wi-text-dim)"></div>
      </div>
    `);
    $mask.append($box);
    $('#' + PANEL_ID).append($mask);

    const $scroll = $box.find('#wi_ps_diag_scroll');
    const $status = $box.find('#wi_ps_diag_status');
    const $followup = $box.find('#wi_ps_diag_followup');

    // ============================================================
    // 渲染所有轮次（重绘）
    // ============================================================
    function renderAll() {
      let html = '';

      diagState.rounds.forEach((round, rIdx) => {
        const roundLabel = '第 ' + (rIdx + 1) + ' 轮';
        html += `
          <div style="margin-bottom:14px;border-left:3px solid ${rIdx === 0 ? 'var(--wi-accent-2)' : 'var(--wi-accent)'};padding-left:10px">
            <div style="font-size:12px;color:${rIdx === 0 ? 'var(--wi-accent-2)' : 'var(--wi-accent)'};font-weight:600;margin-bottom:6px">
              【${roundLabel}】${rIdx === 0 ? '首次诊断' : '追问'}
            </div>
            <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:6px;background:var(--wi-bg-0);padding:6px 8px;border-radius:4px;line-height:1.6">
              <b style="color:var(--wi-text)">问题：</b>${escapeHtml(round.question && round.question.trim() ? round.question : '（整体体检）', 999999)}
              ${round.sample && round.sample.trim() ? `<details style="margin-top:4px"><summary style="cursor:pointer;color:var(--wi-text-faint)">查看实际输出样本</summary><div style="margin-top:4px;white-space:pre-wrap;color:var(--wi-text-dim);font-family:monospace;font-size:10px;max-height:120px;overflow-y:auto">${escapeHtml(round.sample.slice(0, 1000))}${round.sample.length > 1000 ? '\n…（截断）' : ''}</div></details>` : ''}
            </div>
          </div>
        `;

        // 诊断文字
        if (round.diagnosis) {
          html += `
            <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:12px;margin-bottom:10px;margin-left:10px">
              <div style="font-size:12px;color:var(--wi-warn);font-weight:600;margin-bottom:6px">📋 诊断分析</div>
              <div style="font-size:12px;color:var(--wi-text);line-height:1.8;white-space:pre-wrap">${escapeHtml(round.diagnosis, 999999)}</div>
            </div>
          `;
        } else if (round.changes.length === 0 && rIdx > 0) {
          html += `<div style="color:var(--wi-ok);padding:8px 10px;margin-left:10px;font-size:12px">✅ 这轮 AI 认为不需要额外修改</div>`;
        }
      });

      // ★ 建议清单（累积的总清单）
      const validChanges = diagState.allChanges.filter(c => !c._invalid);
      const invalidChanges = diagState.allChanges.filter(c => c._invalid);

      html += `<div style="margin-top:16px;margin-bottom:8px;font-size:13px;color:var(--wi-text);font-weight:600">
        🔧 修改建议清单（共 ${validChanges.length} 条${invalidChanges.length > 0 ? `，另有 ${invalidChanges.length} 条无效` : ''}）
      </div>`;
      html += `<div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:10px">
        多轮建议已合并。同一入口被多轮改过，以最新一轮为准。默认全选。
      </div>`;

      if (validChanges.length === 0 && invalidChanges.length === 0) {
        html += `<div style="color:var(--wi-ok);padding:20px;text-align:center;font-size:13px">✅ 目前没有任何修改建议</div>`;
      } else {
        // 建议卡片
        diagState.allChanges.forEach((c, i) => {
          if (c._invalid) {
            html += `
              <div style="border:1px solid var(--wi-border);border-radius:6px;padding:8px;margin-bottom:8px;background:var(--wi-bg-1)">
                <div style="font-size:12px;color:var(--wi-err)">❌ 无效建议（${escapeHtml(c._round || '')}）：${escapeHtml(c.reason)}</div>
              </div>
            `;
            return;
          }
          const isMod = c.action === 'modify';
          const icon = isMod ? '🟡' : '🟢';
          const label = isMod ? '修改' : '新增';
          const extra = isMod
            ? `原 ${c.oldContent.length} 字 → 新 ${c.newContent.length} 字`
            : `插入到「${escapeHtml(c.insertAfter === '__LAST__' ? '（末尾）' : c.insertAfter)}」之后`;
          const overwrittenTag = c._overwritten
            ? `<span style="font-size:10px;color:var(--wi-warn);background:var(--wi-bg-2);padding:1px 6px;border-radius:3px;margin-left:6px">（最新一轮覆盖）</span>`
            : '';

          html += `
            <div class="wi-ps-diag-change" data-idx="${i}" style="border:1px solid var(--wi-border);border-radius:6px;padding:8px;margin-bottom:8px;background:var(--wi-bg-1)">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" class="wi-ps-diag-cb" data-idx="${i}" checked style="cursor:pointer">
                <span style="font-size:12px;color:var(--wi-text);font-weight:600;flex:1;min-width:0">${icon} ${label}「${escapeHtml(c.entryName)}」${overwrittenTag}</span>
                <span style="font-size:10px;color:var(--wi-text-dim)">${escapeHtml(c._round || '')}</span>
              </label>
              <div style="font-size:11px;color:var(--wi-text-dim);margin-top:4px;padding-left:24px">理由：${escapeHtml(c.reason)}</div>
              <div style="font-size:10px;color:var(--wi-text-dim);margin-top:2px;padding-left:24px">${extra}</div>
              <div style="margin-top:6px;padding-left:24px">
                <span class="wi-ps-diag-expand" data-idx="${i}" style="font-size:11px;color:var(--wi-accent);cursor:pointer;user-select:none">展开对比 ▼</span>
              </div>
              <div class="wi-ps-diag-detail" data-idx="${i}" style="display:none;margin-top:6px;padding-left:24px"></div>
            </div>
          `;
        });
      }

      $scroll.html(html);
      bindEvents();
    }

    function bindEvents() {
      // 展开对比
      $scroll.find('.wi-ps-diag-expand').on('click', function () {
        const idx = Number($(this).data('idx'));
        const $detail = $scroll.find(`.wi-ps-diag-detail[data-idx="${idx}"]`);
        if ($detail.is(':visible')) {
          $detail.hide();
          $(this).text('展开对比 ▼');
          return;
        }
        if ($detail.data('rendered') !== true) {
          const c = diagState.allChanges[idx];
          let h = '';
          if (c.action === 'modify') {
            h = huRenderTextDiff(c.oldContent, c.newContent);
          } else {
            h = `<div style="font-size:11px;color:var(--wi-ok);margin-bottom:6px">🟢 新条目内容：</div>` + huRenderTextDiff('', c.content);
          }
          $detail.html(h).data('rendered', true);
        }
        $detail.show();
        $(this).text('收起 ▲');
      });
    }

    renderAll();

    // ============================================================
    // 按钮
    // ============================================================
    $box.find('#wi_ps_diag_all').on('click', () => $scroll.find('.wi-ps-diag-cb').prop('checked', true));
    $box.find('#wi_ps_diag_none').on('click', () => $scroll.find('.wi-ps-diag-cb').prop('checked', false));
    $box.find('#wi_ps_diag_cancel').on('click', () => $mask.remove());

    // 追问
    $box.find('#wi_ps_diag_followup_btn').on('click', async () => {
      const q = ($followup.val() || '').trim();
      if (!q) { $status.text('❌ 请输入追问内容').css('color', 'var(--wi-err)'); return; }

      $status.text('⏳ AI 正在回答追问…').css('color', 'var(--wi-accent)');
      $box.find('#wi_ps_diag_followup_btn').prop('disabled', true);

      showLoadingMask('🩺 AI 正在回答追问…', '多轮诊断中，可能需要 30~120 秒。请勿刷新页面。');

      let r;
      try {
        r = await aiDiagnosePreset(diagState.preset, q, '', diagState.opts, diagState.history);
      } finally {
        hideLoadingMask();
        $box.find('#wi_ps_diag_followup_btn').prop('disabled', false);
      }

      if (r.error) {
        $status.html('❌ 追问失败：' + escapeHtml(r.error)).css('color', 'var(--wi-err)');
        if (r.raw) console.error('[诊断][追问] 原始返回:', r.raw);
        return;
      }

      // 合并新一轮
      diagState.roundIdx++;
      const roundLabel = '第 ' + (diagState.rounds.length + 1) + ' 轮';
      const newChanges = normalizeChanges(r.changes, roundLabel);
      diagState.rounds.push({
        question: q,
        sample: '',
        diagnosis: r.diagnosis || '',
        changes: newChanges,
      });
      mergeRoundChanges(roundLabel, newChanges);
      diagState.history.push({
        user: q,
        aiRaw: r.raw || JSON.stringify({ diagnosis: r.diagnosis, changes: r.changes }, null, 2),
      });

      $status.html(`✅ 第 ${diagState.rounds.length} 轮完成`).css('color', 'var(--wi-ok)');
      $followup.val('');
      renderAll();
      // 滚到底部
      $scroll.scrollTop($scroll[0].scrollHeight);
    });

    // 应用
    $box.find('#wi_ps_diag_apply').on('click', async () => {
      const selected = [];
      $scroll.find('.wi-ps-diag-cb:checked').each(function () {
        selected.push(Number($(this).data('idx')));
      });
      if (selected.length === 0) { alert('没有勾选任何改动'); return; }

      const toApply = selected.map(i => diagState.allChanges[i]).filter(c => c && !c._invalid);
      if (toApply.length === 0) { alert('选中的都是无效建议'); return; }

      $mask.remove();
      await applyDiagnoseChanges(state.activePreset, toApply);
    });
  }

  async function applyDiagnoseChanges(targetName, changes) {
    const preset = readPreset(targetName);
    if (!preset) { alert('读取预设失败'); return; }

    const newPreset = JSON.parse(JSON.stringify(preset));
    let prompts = getNormalizedPrompts(newPreset);
    let order = getPromptOrder(newPreset) || [];
    if (!order.length) {
      order = prompts.map(p => ({ identifier: p.identifier, enabled: p.enabled !== false }));
    }

    let modified = 0, added = 0;

    // ★ 先处理 modify（按 identifier 直接替换内容）
    for (const c of changes) {
      if (c.action !== 'modify') continue;
      const target = prompts.find(p => p.identifier === c.entryId);
      if (!target) { console.warn('[诊断][写入] 找不到 modify 目标:', c.entryName); continue; }
      target.content = c.newContent;
      modified++;
    }

    // ★ 再处理 add（按 insertAfter 定位）
    for (const c of changes) {
      if (c.action !== 'add') continue;

      const newId = uuid();
      const newEntry = {
        identifier: newId,
        id: newId,
        name: c.entryName,
        content: c.content,
        role: 'system',
        enabled: true,
      };

      let insertAt = order.length;

      if (c.insertAfter && c.insertAfter !== '__LAST__') {
        // 在新 prompts 里按名字找
        const anchor = prompts.find(p => (p.name || '') === c.insertAfter);
        if (anchor) {
          const orderIdx = order.findIndex(o => o.identifier === anchor.identifier);
          if (orderIdx >= 0) insertAt = orderIdx + 1;
        } else {
          console.warn('[诊断][写入] add 的 insertAfter 找不到:', c.insertAfter, '→ 放到末尾');
        }
      }

      prompts.push(newEntry);
      order.splice(insertAt, 0, { identifier: newId, enabled: true });
      added++;
    }

    // ★ 写回
    const fmt = getPresetFormat(preset);
    if (fmt === 'modern') {
      if (newPreset.prompt_order && newPreset.prompt_order[0]) {
        newPreset.prompt_order[0].order = order;
      } else {
        newPreset.prompt_order = [{ character_id: 100001, order }];
      }
      newPreset.prompts = prompts;
    } else {
      const promptMap = new Map();
      prompts.forEach(p => promptMap.set(p.identifier, p));
      const reordered = [];
      order.forEach(o => {
        const p = promptMap.get(o.identifier);
        if (p) { p.enabled = o.enabled !== false; reordered.push(p); }
      });
      prompts.forEach(p => { if (!reordered.includes(p)) reordered.push(p); });
      newPreset.prompts = reordered;
    }

    showLoadingMask('💾 正在写入…', `修改 ${modified} 条 · 新增 ${added} 条`);
    await createBackup(targetName, '诊断');   // ★ 写入前备份
    let ok = false;
    try {
      ok = await writePreset(targetName, newPreset);
    } finally {
      hideLoadingMask();
    }

    if (ok) {
      if (window.toastr) window.toastr.success(`✅ 已应用：修改 ${modified} 条 · 新增 ${added} 条`);
      else alert(`✅ 已应用\n修改 ${modified} 条 · 新增 ${added} 条`);

      // 自动重载
      try {
        const cur = getCurrentPresetName();
        if (cur === targetName && typeof window.loadPreset === 'function') {
          window.loadPreset(cur);
        }
      } catch (e) { }

      // 刷新详情
      renderPresetDetail(targetName);
    } else {
      alert('❌ 写入失败，看 F12');
    }
  }

  function renderPresetDetail(name) {
    const preset = readPreset(name);
    if (!preset) {
      $('#wi_ps_preset_detail').html('<div style="color:var(--wi-err);padding:20px">读取预设失败</div>');
      return;
    }

    const prompts = getPrompts(preset);
    let enabledCount = 0;
    let totalChars = 0;
    const varSlots = new Map();

    prompts.forEach(p => {
      const sv = parseSetVars(p.content || '');
      totalChars += (p.content || '').length;
      if (getPromptEnabled(preset, p.identifier)) enabledCount++;
      sv.forEach(s => {
        if (!varSlots.has(s.name)) varSlots.set(s.name, []);
        varSlots.get(s.name).push({ promptName: p.name, promptId: p.identifier, hasContent: isAssignmentSetVar(s) });
      });
    });

    // ============================================================
    // [变量自检] 检查 setvar / getvar 是否配套
    // ============================================================
    const varAudit = (function () {
      const allEntries = extractOrderedEntries(preset);
      const definedVars = new Map();   // 变量名 -> [{entryName, entryId, type}]
      const referencedVars = new Map(); // 变量名 -> [{entryName, entryId}]

      allEntries.forEach(e => {
        // ★ 只检查已启用的条目，禁用的一律跳过
        if (e.enabled === false) return;

        const content = e.prompt.content || '';
        const sets = parseSetVars(content);
        const gets = parseGetVars(content);

        // 只有"赋值型" setvar 才算变量被定义（空 setvar 是初始化，也算定义）
        sets.forEach(s => {
          if (!definedVars.has(s.name)) definedVars.set(s.name, []);
          definedVars.get(s.name).push({
            entryName: e.name,
            entryId: e.identifier,
            hasContent: isAssignmentSetVar(s),
            enabled: e.enabled !== false,
          });
        });

        gets.forEach(g => {
          if (!referencedVars.has(g.name)) referencedVars.set(g.name, []);
          referencedVars.get(g.name).push({
            entryName: e.name,
            entryId: e.identifier,
            enabled: e.enabled !== false,
          });
        });
      });

      const issues = [];

      // 1. 定义了 setvar，但没有任何 getvar 引用 → 内容永远不会进上下文
      //    ★ 只有"赋值型 setvar"（带内容的）才算，空 setvar 初始化不算
      //    ★ 只在至少有一条赋值型 setvar 所在条目启用时才报
      definedVars.forEach((defs, varName) => {
        if (referencedVars.has(varName)) return;

        const assignments = defs.filter(d => d.hasContent);
        if (assignments.length === 0) return;   // 全是空 setvar，跳过

        issues.push({
          level: 'warn',
          type: 'setvar-无getvar',
          varName,
          detail: `变量「${varName}」被赋值，但全预设没有任何 {{getvar::${varName}}} 引用它，内容不会进入上下文。`,
          entries: assignments.map(d => d.entryName),
        });
      });

      // 2. 引用了 getvar，但全预设没有任何 setvar 定义 → 读到空变量
      referencedVars.forEach((refs, varName) => {
        if (!definedVars.has(varName)) {
          issues.push({
            level: 'error',
            type: 'getvar-无setvar',
            varName,
            detail: `变量「${varName}」被 {{getvar::${varName}}} 引用，但全预设没有任何地方 setvar 定义它，会读到空值。`,
            entries: refs.map(r => r.entryName),
          });
        }
      });

      // 3. 同一变量被多条"赋值型 setvar"重复赋值 → 后面的会覆盖前面的
      definedVars.forEach((defs, varName) => {
        const assignments = defs.filter(d => d.hasContent);
        if (assignments.length > 1) {
          issues.push({
            level: 'warn',
            type: 'setvar-重复赋值',
            varName,
            detail: `变量「${varName}」被 ${assignments.length} 条赋值，后面的会覆盖前面的。`,
            entries: assignments.map(d => d.entryName),
          });
        }
      });

      // 4. 变量只在"已禁用"的条目里定义/引用
      definedVars.forEach((defs, varName) => {
        const allDisabled = defs.every(d => !d.enabled);
        if (allDisabled && defs.length > 0) {
          issues.push({
            level: 'info',
            type: 'setvar-仅禁用条目',
            varName,
            detail: `变量「${varName}」只在已禁用的条目里被 setvar，运行时不会被赋值。`,
            entries: defs.map(d => d.entryName),
          });
        }
      });
      referencedVars.forEach((refs, varName) => {
        const allDisabled = refs.every(r => !r.enabled);
        if (allDisabled && refs.length > 0 && !definedVars.has(varName)) {
          issues.push({
            level: 'info',
            type: 'getvar-仅禁用条目',
            varName,
            detail: `变量「${varName}」只在已禁用的条目里被 getvar，运行时读不到。`,
            entries: refs.map(r => r.entryName),
          });
        }
      });

      return { issues, definedCount: definedVars.size, referencedCount: referencedVars.size };
    })();

    const conflicts = varAudit.issues;

    let html = `
      <div style="font-size:16px;font-weight:700;color:var(--wi-accent);margin-bottom:6px">📋 ${escapeHtml(name)}</div>
      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:14px">${name === getCurrentPresetName() ? '● 当前正在使用' : ''}</div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;text-align:center">
          <div style="font-size:11px;color:var(--wi-text-dim)">条目数</div>
          <div style="font-size:20px;color:var(--wi-accent);font-weight:700;margin-top:4px">${prompts.length}</div>
        </div>
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;text-align:center">
          <div style="font-size:11px;color:var(--wi-text-dim)">已启用</div>
          <div style="font-size:20px;color:var(--wi-ok);font-weight:700;margin-top:4px">${enabledCount}</div>
        </div>
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;text-align:center">
          <div style="font-size:11px;color:var(--wi-text-dim)">变量槽位</div>
          <div style="font-size:20px;color:var(--wi-warn);font-weight:700;margin-top:4px">${varSlots.size}</div>
        </div>
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;text-align:center">
          <div style="font-size:11px;color:var(--wi-text-dim)">总字数</div>
          <div style="font-size:20px;color:var(--wi-text);font-weight:700;margin-top:4px">${totalChars}</div>
        </div>
      </div>
    `;

    if (conflicts.length > 0) {
      const levelMeta = {
        error: { icon: '❌', color: 'var(--wi-err)', bg: 'var(--wi-bg-1)', border: 'var(--wi-border)' },
        warn: { icon: '⚠️', color: 'var(--wi-warn)', bg: 'var(--wi-bg-1)', border: 'var(--wi-border)' },
        info: { icon: 'ℹ️', color: 'var(--wi-accent)', bg: 'var(--wi-bg-1)', border: 'var(--wi-border)' },
      };
      const errCount = conflicts.filter(c => c.level === 'error').length;
      const warnCount = conflicts.filter(c => c.level === 'warn').length;
      const infoCount = conflicts.filter(c => c.level === 'info').length;

      html += `
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:12px;margin-bottom:14px">
          <div style="font-size:12px;color:var(--wi-text);font-weight:600;margin-bottom:8px">
            🔍 变量自检
            <span style="font-weight:400;font-size:11px;color:var(--wi-text-dim)">
              （定义 ${varAudit.definedCount} 个变量，引用 ${varAudit.referencedCount} 个）
            </span>
            <span style="font-weight:400;font-size:11px;margin-left:8px">
              ${errCount > 0 ? `<span style="color:var(--wi-err)">❌ ${errCount}</span> ` : ''}
              ${warnCount > 0 ? `<span style="color:var(--wi-warn)">⚠️ ${warnCount}</span> ` : ''}
              ${infoCount > 0 ? `<span style="color:var(--wi-accent)">ℹ️ ${infoCount}</span>` : ''}
            </span>
          </div>
          <div style="font-size:11px;color:var(--wi-text);line-height:1.9;max-height:260px;overflow-y:auto">
            ${conflicts.slice(0, 30).map(c => {
        const m = levelMeta[c.level] || levelMeta.info;
        return `
                <div style="margin-bottom:6px;padding:6px 8px;background:${m.bg};border:1px solid ${m.border};border-radius:4px">
                  <div style="color:${m.color};font-weight:600">
                    ${m.icon} ${escapeHtml(c.type)}：<b>${escapeHtml(c.varName)}</b>
                  </div>
                  <div style="color:var(--wi-text);margin-top:3px">${escapeHtml(c.detail)}</div>
                  <div style="color:var(--wi-text-dim);margin-top:3px;font-size:10px">涉及条目：${c.entries.map(n => escapeHtml(n)).join(' / ')}</div>
                </div>
              `;
      }).join('')}
            ${conflicts.length > 30 ? `<div style="color:var(--wi-text-dim);margin-top:6px">…还有 ${conflicts.length - 30} 个</div>` : ''}
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px 12px;margin-bottom:14px">
          <div style="font-size:12px;color:var(--wi-ok);font-weight:600">
            ✅ 变量自检通过
            <span style="font-weight:400;font-size:11px;color:var(--wi-text-dim)">
              （定义 ${varAudit.definedCount} 个变量，引用 ${varAudit.referencedCount} 个，未发现 setvar/getvar 不配套）
            </span>
          </div>
        </div>
      `;
    }

    html += `
      <div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap">
        <button id="wi_ps_detail_edit" style="${BTN_CSS}">✏️ 编辑条目</button>
        <button id="wi_ps_detail_export" style="${BTN_CSS}">📤 导出 JSON</button>
        <button id="wi_ps_detail_diagnose" style="${BTN_AI_CSS}">🩺 诊断与调整</button>
      </div>
    `;

    $('#wi_ps_preset_detail').html(html);

    $('#wi_ps_detail_edit').on('click', () => {
      $('.wi-ps-tab[data-tab="edit"]').click();
      setTimeout(() => {
        $('#wi_ps_edit_preset_select').val(name).trigger('change');
      }, 100);
    });
    $('#wi_ps_detail_export').on('click', () => exportPreset(name));
    $('#wi_ps_detail_diagnose').on('click', () => {
      state.activePreset = name;
      showDiagnoseDialog();
    });
  }

  async function createNewPreset() {
    const name = prompt('新预设名：', '未命名预设');
    if (!name) return;
    const empty = { temperature: 1, prompts: [], prompt_order: [{ character_id: 100001, order: [] }] };
    const ok = await writePreset(name, empty);
    if (ok) {
      if (window.toastr) window.toastr.success('已创建：' + name);
      refreshPresetList();
    } else {
      alert('创建失败');
    }
  }

  async function duplicatePreset() {
    if (!state.activePreset) { alert('请先选一个预设'); return; }
    const src = readPreset(state.activePreset);
    if (!src) { alert('读取失败'); return; }
    const name = prompt('复制为：', state.activePreset + ' 副本');
    if (!name) return;
    const copy = JSON.parse(JSON.stringify(src));
    const ok = await writePreset(name, copy);
    if (ok) {
      if (window.toastr) window.toastr.success('已复制：' + name);
      refreshPresetList();
    } else {
      alert('复制失败');
    }
  }

  function exportPreset(name) {
    const preset = readPreset(name);
    if (!preset) { alert('读取失败'); return; }
    const json = JSON.stringify(preset, null, 2);
    showModal(`
      <div style="font-size:13px;font-weight:700;color:var(--wi-text);margin-bottom:6px">📤 导出预设：${escapeHtml(name)}</div>
      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:8px">复制下面的 JSON，或点下载。</div>
      <textarea readonly style="width:100%;height:320px;background:var(--wi-bg-0);color:var(--wi-text);border:1px solid var(--wi-border);border-radius:4px;padding:8px;box-sizing:border-box;font-family:monospace;font-size:11px;resize:vertical">${escapeHtml(json, 999999)}</textarea>
      <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
        <button id="wi_ps_exp_download" style="${BTN_PRIMARY_CSS}">💾 下载为 .json</button>
        <button id="wi_ps_exp_copy" style="${BTN_CSS}">📋 复制到剪贴板</button>
        <button id="wi_ps_exp_close" style="${BTN_CSS}">关闭</button>
      </div>
    `, ($m) => {
      $m.find('#wi_ps_exp_download').on('click', () => {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `preset_${name.replace(/[\\/:*?"<>|]/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      $m.find('#wi_ps_exp_copy').on('click', async () => {
        const ta = $m.find('textarea')[0];
        try {
          await navigator.clipboard.writeText(ta.value);
          alert('已复制到剪贴板');
        } catch (e) {
          ta.select();
          document.execCommand('copy');
          alert('已复制到剪贴板');
        }
      });
      $m.find('#wi_ps_exp_close').on('click', () => $m.closest('#wi_ps_modal_mask').remove());
    });
  }

  // ============================================================
  // [TAB 2] 条目编辑
  // ============================================================
  function refreshEditTab() {
    const $sel = $('#wi_ps_edit_preset_select').empty();
    state.presets.forEach(name => {
      $sel.append($('<option>').val(name).text(name));
    });
    if (state.activePreset && state.presets.includes(state.activePreset)) {
      $sel.val(state.activePreset);
      loadPresetForEdit(state.activePreset);
    } else if (state.presets.length > 0) {
      state.activePreset = state.presets[0];
      $sel.val(state.activePreset);
      loadPresetForEdit(state.activePreset);
    }
  }

  function loadPresetForEdit(name) {
    const preset = readPreset(name);
    if (!preset) { alert('读取失败'); return; }
    state.presetData = preset;
    state.prompts = getPrompts(preset);
    state.promptOrder = getPromptOrder(preset) || [];
    // ★ 修：给缺 identifier 的条目补唯一 key，避免"选中一条其他全高亮"
    state.prompts.forEach((p, i) => {
      if (!p.identifier) p.identifier = '__auto_p_' + i + '_' + Date.now();
    });
    state.selectedIdentifier = null;
    renderEditList();
    renderEditDetailEmpty();
  }

  function renderEditList() {
    const $list = $('#wi_ps_edit_list').empty();
    const term = (state.searchTerm || '').toLowerCase();

    const orderedPrompts = [];
    const idMap = new Map();
    state.prompts.forEach(p => idMap.set(p.identifier, p));
    state.promptOrder.forEach(o => {
      const p = idMap.get(o.identifier);
      if (p) orderedPrompts.push({ ...p, _enabled: o.enabled });
    });
    state.prompts.forEach(p => {
      if (!state.promptOrder.find(o => o.identifier === p.identifier)) {
        orderedPrompts.push({ ...p, _enabled: false });
      }
    });

    const filtered = term
      ? orderedPrompts.filter(p => (p.name || '').toLowerCase().includes(term))
      : orderedPrompts;

    $('#wi_ps_edit_count').text(`${filtered.length} / ${orderedPrompts.length} 条`);

    if (filtered.length === 0) {
      $list.append('<div style="color:var(--wi-text-dim);text-align:center;padding:30px;font-size:12px">没有匹配的条目</div>');
      return;
    }

    filtered.forEach(p => {
      const isSelected = p.identifier === state.selectedIdentifier;
      const hasSet = parseSetVars(p.content || '').length > 0;
      const hasGet = parseGetVars(p.content || '').length > 0;
      const dotColor = p._enabled ? 'var(--wi-ok)' : 'var(--wi-text-faint)';
      let tag = '';
      if (hasSet) tag = '<span style="color:var(--wi-warn);font-size:10px">📝set</span>';
      else if (hasGet) tag = '<span style="color:var(--wi-accent);font-size:10px">👁get</span>';

      const $item = $(`
        <div class="wi-ps-edit-item" data-id="${escapeHtml(p.identifier)}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--wi-border-soft);background:${isSelected ? 'var(--wi-bg-3)' : 'transparent'}">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="flex-shrink:0;width:8px;height:8px;border-radius:50%;background:${dotColor}"></span>
            <div style="flex:1;min-width:0;font-size:12px;color:${p._enabled ? 'var(--wi-text)' : 'var(--wi-text-dim)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escapeHtml(p.name || '(无名称)')}
            </div>
          </div>
          <div style="font-size:10px;color:var(--wi-text-dim);margin-top:3px;display:flex;gap:6px;align-items:center">
            ${tag}
            <span>${(p.content || '').length} 字</span>
          </div>
        </div>
      `);
      $item.on('click', () => {
        state.selectedIdentifier = p.identifier;
        renderEditList();
        renderEditDetail(p);
      });
      $list.append($item);
    });
  }

  function renderEditDetailEmpty() {
    $('#wi_ps_edit_detail').html(`
      <div style="color:var(--wi-text-dim);text-align:center;padding:60px 20px;font-size:13px">
        <div style="font-size:32px;margin-bottom:12px">✏️</div>
        <div>从左侧选一个条目查看详情</div>
      </div>
    `);
  }

  function renderEditDetail(p) {
    const setVars = parseSetVars(p.content || '');
    const getVars = parseGetVars(p.content || '');

    let html = `
      <div style="font-size:14px;font-weight:700;color:var(--wi-accent);margin-bottom:10px">
        ${escapeHtml(p.name || '(无名称)')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;font-size:11px">
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:6px 10px">
          <div style="color:var(--wi-text-dim)">Identifier</div>
          <div style="color:var(--wi-text);font-family:monospace;margin-top:2px;font-size:10px;word-break:break-all">${escapeHtml(p.identifier)}</div>
        </div>
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:6px 10px">
          <div style="color:var(--wi-text-dim)">角色</div>
          <div style="color:var(--wi-text);margin-top:2px">${escapeHtml(p.role || 'system')}</div>
        </div>
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:6px 10px">
          <div style="color:var(--wi-text-dim)">Marker</div>
          <div style="color:var(--wi-text);margin-top:2px">${p.marker ? '是' : '否'}</div>
        </div>
      </div>
    `;

    if (setVars.length > 0) {
      html += `
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:12px">
          <div style="font-size:12px;color:var(--wi-warn);font-weight:600;margin-bottom:6px">📝 写入变量（${setVars.length}）</div>
          ${setVars.map(v => `
            <div style="font-size:11px;color:var(--wi-text);margin-bottom:4px;line-height:1.6">
              · <b style="color:var(--wi-warn)">${escapeHtml(v.name)}</b>
              ${isAssignmentSetVar(v) ? `<span style="color:var(--wi-ok)">[赋值 ${v.value.length} 字]</span>` : '<span style="color:var(--wi-text-dim)">[初始化]</span>'}
            </div>
          `).join('')}
        </div>
      `;
    }

    if (getVars.length > 0) {
      html += `
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:12px">
          <div style="font-size:12px;color:var(--wi-accent);font-weight:600;margin-bottom:6px">👁 读取变量（${getVars.length}）</div>
          ${getVars.map(v => `
            <div style="font-size:11px;color:var(--wi-text);margin-bottom:4px;line-height:1.6">
              · <b style="color:var(--wi-accent)">${escapeHtml(v.name)}</b>
            </div>
          `).join('')}
        </div>
      `;
    }

    html += `
      <div style="${LABEL_CSS}">名称</div>
      <input id="wi_ps_edit_name" value="${escapeHtml(p.name || '')}" style="${INPUT_CSS}">
      <div style="${LABEL_CSS}">内容（${(p.content || '').length} 字）</div>
      <textarea id="wi_ps_edit_content" style="${INPUT_CSS}height:400px;resize:vertical;font-family:monospace;font-size:11px;line-height:1.5">${escapeHtml(p.content || '', 999999)}</textarea>
      <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
        <button id="wi_ps_edit_save" style="${BTN_PRIMARY_CSS}">💾 保存条目</button>
        <button id="wi_ps_edit_enable" style="${BTN_CSS}">${getPromptEnabled(state.presetData, p.identifier) ? '⏸ 禁用' : '▶ 启用'}</button>
        <button id="wi_ps_edit_copy_id" style="${BTN_CSS}">📋 复制内部编号（调试用）</button>
      </div>
    `;

    $('#wi_ps_edit_detail').html(html);

    $('#wi_ps_edit_save').on('click', async () => {
      const newName = $('#wi_ps_edit_name').val();
      const newContent = $('#wi_ps_edit_content').val();
      const target = state.prompts.find(x => x.identifier === p.identifier);
      if (!target) { alert('找不到条目'); return; }
      target.name = newName;
      target.content = newContent;
      await createBackup(state.activePreset, '编辑');   // ★ 写入前备份
      const ok = await writePreset(state.activePreset, state.presetData);
      if (ok) {
        if (window.toastr) window.toastr.success('已保存');
        loadPresetForEdit(state.activePreset);
      } else {
        alert('保存失败');
      }
    });

    $('#wi_ps_edit_enable').on('click', async () => {
      const cur = getPromptEnabled(state.presetData, p.identifier);
      setPromptEnabled(state.presetData, p.identifier, !cur);
      await createBackup(state.activePreset, '启停切换');   // ★ 写入前备份
      const ok = await writePreset(state.activePreset, state.presetData);
      if (ok) {
        if (window.toastr) window.toastr.success(cur ? '已禁用' : '已启用');
        loadPresetForEdit(state.activePreset);
      } else {
        alert('切换失败');
      }
    });

    $('#wi_ps_edit_copy_id').on('click', async () => {
      try {
        await navigator.clipboard.writeText(p.identifier);
        if (window.toastr) window.toastr.success('已复制');
      } catch (e) {
        alert('复制失败');
      }
    });
  }

  // ============================================================
  // [TAB 3] 缝合模式
  // ============================================================

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findShiftedVarName(varName, occupiedVars) {
    const numbered = parseNumberedVarName(varName);
    if (numbered) {
      let i = numbered.num + 1;
      while (occupiedVars.has(`${numbered.prefix}${i}`)) i++;
      return `${numbered.prefix}${i}`;
    }
    let i = 2;
    while (occupiedVars.has(`${varName}${i}`)) i++;
    return `${varName}${i}`;
  }

  function extractOrderedEntries(preset) {
    if (!preset) return [];
    const rawPrompts = getPrompts(preset);
    const prompts = rawPrompts.map(normalizePrompt).filter(p => p && typeof p === 'object' && p.identifier);
    const order = getPromptOrder(preset);

    const map = new Map();
    prompts.forEach(p => map.set(p.identifier, p));

    const out = [];
    const seen = new Set();

    if (Array.isArray(order)) {
      order.forEach(o => {
        const p = map.get(o.identifier);
        if (p && !seen.has(o.identifier)) {
          seen.add(o.identifier);
          out.push({ identifier: o.identifier, name: p.name || '(无名称)', enabled: o.enabled !== false, prompt: p });
        }
      });
    }

    prompts.forEach(p => {
      if (!seen.has(p.identifier)) {
        seen.add(p.identifier);
        out.push({ identifier: p.identifier, name: p.name || '(无名称)', enabled: p.enabled !== false, prompt: p });
      }
    });

    return out;
  }

  // 按分隔行切 zone
  function scanByDividers(entryNames) {
    // 判定分隔行类型：
    // 'head' = 区头（开新 zone）
    // 'tail' = 区尾（并入当前 zone）
    // null   = 不是分隔行
    const classify = (name) => {
      const n = String(name || '').trim();
      if (!n) return null;

      // ╓XXX╖ → 区头
      if (/^╓.+╖$/.test(n)) return 'head';
      // ╙XXX╜ → 区尾
      if (/^╙.+╜$/.test(n)) return 'tail';
      // >>>XXX<<< → 区尾
      if (/^>{2,}.+<{2,}$/.test(n)) return 'tail';

      // ——XXX—— （前后都是 em-dash）
      if (/^—{2,}.+—{2,}$/.test(n)) {
        // 判定是"区头"还是"区尾"：名字里含"结束/END/尾部/完毕"等词 → 区尾
        if (/结束|END|尾部|完毕|终止|close/i.test(n)) return 'tail';
        return 'head';
      }

      return null;
    };

    const dividers = [];
    entryNames.forEach((n, i) => {
      const t = classify(n);
      if (t) dividers.push({ idx: i, name: n, type: t });
    });

    if (dividers.length < 3) return null;

    const zones = [];
    let segStart = 0;
    let currentHead = null; // 当前 zone 的区头名（用于命名）

    for (let di = 0; di < dividers.length; di++) {
      const d = dividers[di];

      if (d.type === 'head') {
        // 区头：先把 segStart ~ d.idx-1 收成一个 zone（如果有内容）
        if (d.idx > segStart) {
          zones.push({
            startIdx: segStart,
            endIdx: d.idx - 1,
            name: currentHead ? `（${currentHead}）` : '(顶部)',
            zoneType: 'other',
            reason: currentHead ? `在区头「${currentHead}」内` : '预设顶部',
            _fromDivider: true,
          });
        }
        // 新区从这里开始，区头本身是它的首条
        segStart = d.idx;
        currentHead = d.name;
      } else if (d.type === 'tail') {
        // 区尾：并入当前 zone（segStart ~ d.idx），然后切一个 zone
        zones.push({
          startIdx: segStart,
          endIdx: d.idx,
          name: currentHead ? `（${currentHead}）` : '(区段)',
          zoneType: 'other',
          reason: currentHead ? `区头「${currentHead}」到区尾「${d.name}」` : `区尾「${d.name}」`,
          _fromDivider: true,
        });
        segStart = d.idx + 1;
        currentHead = null;
      }
    }

    // 最后一段
    if (segStart <= entryNames.length - 1) {
      zones.push({
        startIdx: segStart,
        endIdx: entryNames.length - 1,
        name: currentHead ? `（${currentHead}）` : '(底部)',
        zoneType: 'other',
        reason: currentHead ? `在区头「${currentHead}」内` : '预设底部',
        _fromDivider: true,
      });
    }

    // 过滤空 zone
    const filtered = zones.filter(z => z.endIdx >= z.startIdx);

    // ★ 重名处理：加后缀 (2) (3)
    const nameCount = {};
    filtered.forEach(z => {
      const base = z.name;
      nameCount[base] = (nameCount[base] || 0) + 1;
      if (nameCount[base] > 1) z.name = `${base}·${nameCount[base]}`;
    });

    // 补 entryCount / allNames / sampleNames
    filtered.forEach(z => {
      z.entryCount = z.endIdx - z.startIdx + 1;
      z.allNames = entryNames.slice(z.startIdx, z.endIdx + 1);
      z.sampleNames = z.allNames.slice(0, 8);
    });

    // ★ 识别 COT 区
    const cotZone = filtered.find(z =>
      /COT|思维链|思考|推理|thinking/i.test(z.name) ||
      z.allNames.some(n => /COT|思维链|思考|推理|thinking/i.test(n))
    );
    if (cotZone) {
      cotZone.name = 'COT区';
      cotZone.zoneType = 'cot';
    }

    return filtered;
  }

  // 简化的结构扫描：只识别变量区和 COT 区，分区交给 AI
  function scanPresetStructure(preset) {
    if (!preset) return null;
    const entries = extractOrderedEntries(preset);

    const result = {
      varInitEntry: null,
      cotEntries: [],
      defaultCotId: null,
      zones: [],
      detectedBy: 'none',
    };

    const entryStats = entries.map((e, idx) => {
      const content = e.prompt.content || '';
      const setVars = parseSetVars(content);
      const getVars = parseGetVars(content);
      const emptySetVars = setVars.filter(sv => !isAssignmentSetVar(sv));
      return {
        idx,
        entry: e,
        emptySetVars,
        emptySetCount: emptySetVars.length,
        getCount: getVars.length,
        getVars,
      };
    });

    let maxEmpty = 0, varInitCandidate = null;
    for (const stat of entryStats) {
      if (stat.emptySetCount > maxEmpty) {
        maxEmpty = stat.emptySetCount;
        varInitCandidate = stat;
      }
    }
    if (varInitCandidate && maxEmpty >= 5) {
      result.varInitEntry = {
        identifier: varInitCandidate.entry.identifier,
        name: varInitCandidate.entry.name,
        varCount: maxEmpty,
        setVars: varInitCandidate.emptySetVars,
      };
    }

    const cotCandidates = entryStats
      .filter(s => s.getCount >= 3)
      .sort((a, b) => b.getCount - a.getCount);
    result.cotEntries = cotCandidates.map(s => ({
      identifier: s.entry.identifier,
      name: s.entry.name,
      varCount: s.getCount,
      getVars: s.getVars,
    }));
    if (result.cotEntries.length > 0) {
      result.defaultCotId = result.cotEntries[0].identifier;
    }

    // ★ 先用分割线预切
    const names = entryStats.map(s => s.entry.name);
    const dividerZones = scanByDividers(names);

    if (dividerZones && dividerZones.length > 0) {
      // 给每个 zone 补 startId / endId
      dividerZones.forEach(z => {
        z.startId = entryStats[z.startIdx]?.entry.identifier || '';
        z.endId = entryStats[z.endIdx]?.entry.identifier || '';
      });
      result.zones = dividerZones;
      result.detectedBy = 'divider';
      console.log('[缝合器] 用分割线预切出', dividerZones.length, '个 zone');
    } else {
      // 回退：整预设一个 zone，等 AI
      result.zones.push({
        name: '（整预设）',
        startIdx: 0,
        endIdx: entryStats.length - 1,
        startId: entryStats[0]?.entry.identifier || '',
        endId: entryStats[entryStats.length - 1]?.entry.identifier || '',
        entryCount: entryStats.length,
        _mode: 'fallback',
        sampleNames: entryStats.slice(0, 8).map(s => s.entry.name),
        allNames: entryStats.map(s => s.entry.name),
      });
      console.log('[缝合器] 分割线太少，需要 AI 介入分析结构');
    }

    return result;
  }

  function findVarInitEntryId() {
    if (state.sutureManualOverride.varInitId) return state.sutureManualOverride.varInitId;
    if (state.sutureTargetStructure?.varInitEntry) return state.sutureTargetStructure.varInitEntry.identifier;
    return null;
  }

  state.sutureManualOverride = { varInitId: null, cotId: null };

  (function restoreSutureOverride() {
    try {
      const raw = localStorage.getItem('wi_preset_suture_override');
      if (raw) {
        const data = JSON.parse(raw);
        state.sutureManualOverride = { varInitId: data.varInitId || null, cotId: data.cotId || null };
      }
    } catch (e) { }
  })();

  function saveSutureOverride() {
    try {
      localStorage.setItem('wi_preset_suture_override', JSON.stringify(state.sutureManualOverride));
    } catch (e) { }
  }

  function refreshSutureTab() {
    renderSutureUI();
  }

  function refreshHotUpdateTab() {
    renderHotUpdateUI();
  }

  // ============================================================
  // [TAB 5] 备份 / 回档
  // ============================================================
  function refreshBackupTab() {
    renderBackupUI();
  }

  async function renderBackupUI() {
    const $container = $('#wi_ps_backup_content');
    if (!$container.length) return;

    const presetNames = getAllPresetNames();
    const all = await loadAllBackups();

    // 整理一份"有备份的预设"列表
    const rows = [];
    presetNames.forEach(name => {
      const list = Array.isArray(all[name]) ? all[name] : [];
      rows.push({ name, count: list.length });
    });
    // 备份里存在但当前读不到的预设，也列出来（提醒用户）
    Object.keys(all).forEach(name => {
      if (!presetNames.includes(name)) {
        rows.push({ name, count: all[name].length, orphan: true });
      }
    });

    const totalCount = rows.reduce((s, r) => s + r.count, 0);
    // ★ IndexedDB 不支持直接算总量，用记录 size 之和估算
    const totalBytes = Object.values(all).reduce((sum, list) => {
      return sum + list.reduce((s, b) => s + (b.size || 0), 0);
    }, 0);

    let html = `
      <div style="font-size:15px;font-weight:700;color:var(--wi-accent);margin-bottom:12px">💾 预设备份 / 回档</div>

      <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:14px;font-size:11px;color:var(--wi-text);line-height:1.7">
        <b style="color:var(--wi-ok)">机制：</b>每次缝合 / 诊断 / 热更新 / 编辑写回前，自动给该预设存一份完整快照。<br>
        · 每个预设最多保留 <b>${BACKUP_MAX_PER_PRESET}</b> 份<br>
        · 全局最多保留 <b>6</b> 份（优先保最新）<br>
        · 超出上限时自动丢最老的<br>
        · 目前共 <b>${totalCount}</b> 份快照，约占 <b>${formatSize(totalBytes)}</b><br>
        · <span style="color:var(--wi-warn)">备份存在浏览器 IndexedDB（存储空间充足），换设备/清缓存会丢。</span><br>
        · <span style="color:var(--wi-ok)">💾 建议定期「导出全部备份」保存到本地。</span>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <button id="wi_bk_manual" style="${BTN_CSS}">＋ 手动备份当前预设</button>
        <button id="wi_bk_cleanup" style="${BTN_DANGER_CSS}">🗑 清理孤儿备份</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;padding:8px 10px;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px">
        <div style="flex:1;min-width:200px;font-size:11px;color:var(--wi-text-dim);line-height:1.6;align-self:center">
          💾 <b style="color:var(--wi-text)">跨设备搬运</b>：备份存在浏览器里，换设备/清缓存会丢。导出成文件保存，换设备时导入即可。
        </div>
        <button id="wi_bk_export_all" style="${BTN_CSS}">📤 导出全部备份</button>
        <button id="wi_bk_import" style="${BTN_AI_CSS}">📥 导入备份文件</button>
      </div>
    `;

    if (rows.length === 0) {
      html += `<div style="color:var(--wi-text-dim);text-align:center;padding:40px;font-size:12px">还没有任何备份</div>`;
      $container.html(html);
      bindBackupEvents($container);
      return;
    }

    html += `<div style="font-size:12px;color:var(--wi-text);font-weight:600;margin-bottom:6px">预设列表（点名字展开快照）</div>`;
    html += `<div style="border:1px solid var(--wi-border);border-radius:6px;overflow:hidden">`;

    rows.forEach((r, i) => {
      const orphanTag = r.orphan
        ? `<span style="font-size:10px;color:var(--wi-warn);margin-left:6px">（当前读不到该预设）</span>`
        : '';
      html += `
        <div class="wi-bk-preset-row" data-name="${escapeHtml(r.name)}" style="border-bottom:1px solid var(--wi-border-soft);">
          <div class="wi-bk-preset-head" data-name="${escapeHtml(r.name)}" style="padding:10px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;background:var(--wi-bg-1)">
            <span class="wi-bk-arrow" style="font-size:10px;color:var(--wi-text-dim);transition:transform .15s">▶</span>
            <span style="flex:1;font-size:12px;color:var(--wi-text)">${escapeHtml(r.name)}${orphanTag}</span>
            <span style="font-size:11px;color:var(--wi-text-dim)">${r.count} 份</span>
          </div>
          <div class="wi-bk-preset-body" data-name="${escapeHtml(r.name)}" style="display:none;padding:6px 10px;background:var(--wi-bg-0)"></div>
        </div>
      `;
    });

    html += `</div>`;
    $container.html(html);
    bindBackupEvents($container);

    // 展开逻辑
    $container.find('.wi-bk-preset-head').on('click', async function () {
      const name = $(this).attr('data-name');
      const $body = $container.find(`.wi-bk-preset-body[data-name="${CSS.escape(name)}"]`);
      const $arrow = $(this).find('.wi-bk-arrow');
      if ($body.is(':visible')) {
        $body.hide();
        $arrow.css('transform', 'rotate(0deg)');
        return;
      }
      // 渲染快照列表
      const list = await listBackups(name);
      if (list.length === 0) {
        $body.html('<div style="font-size:11px;color:var(--wi-text-dim);padding:10px">该预设暂无快照</div>');
      } else {
        const headHtml = `
          <div style="display:flex;justify-content:flex-end;margin-bottom:6px">
            <button class="wi-bk-export-one" data-name="${escapeHtml(name)}" style="${BTN_CSS}font-size:10px;padding:2px 8px">📤 只导出这个预设的备份</button>
          </div>
        `;
        const rowsHtml = list.map(b => `
          <div class="wi-bk-item" data-name="${escapeHtml(name)}" data-id="${escapeHtml(b.id)}" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px dashed var(--wi-border-soft)">
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;color:var(--wi-text)">
                <b style="color:var(--wi-accent-2)">${escapeHtml(b.action || '手动')}</b>
                <span style="color:var(--wi-text-dim);margin-left:6px">${formatBackupTime(b.ts)}</span>
              </div>
              <div style="font-size:10px;color:var(--wi-text-dim);margin-top:2px">${formatSize(b.size)} · ${(b.data && Array.isArray(b.data.prompts)) ? b.data.prompts.length : '?'} 条</div>
            </div>
            <button class="wi-bk-restore" data-name="${escapeHtml(name)}" data-id="${escapeHtml(b.id)}" style="${BTN_PRIMARY_CSS}font-size:11px;padding:3px 10px">回档</button>
            <button class="wi-bk-delete" data-name="${escapeHtml(name)}" data-id="${escapeHtml(b.id)}" style="${BTN_CSS}font-size:11px;padding:3px 10px">删除</button>
          </div>
        `).join('');
        $body.html(headHtml + rowsHtml);
      }
      $body.show();
      $arrow.css('transform', 'rotate(90deg)');
    });
  }

  function bindBackupEvents($container) {
    // 手动备份当前预设
    $container.find('#wi_bk_manual').on('click', async () => {
      const current = getCurrentPresetName();
      if (!current) { alert('当前没有加载中的预设'); return; }
      const id = await createBackup(current, '手动');
      if (id) {
        if (window.toastr) window.toastr.success('已手动备份：' + current);
        renderBackupUI();
      } else {
        alert('备份失败（看 F12）');
      }
    });

    // 导出全部备份
    $container.find('#wi_bk_export_all').on('click', () => {
      exportBackupsToFile(null);
    });

    // 导入备份文件
    $container.find('#wi_bk_import').on('click', () => {
      importBackupsFromFile();
    });

    // 清理孤儿备份
    $container.find('#wi_bk_cleanup').on('click', async () => {
      const presetNames = getAllPresetNames();
      const all = await loadAllBackups();
      const orphans = Object.keys(all).filter(n => !presetNames.includes(n));
      if (orphans.length === 0) { alert('没有孤儿备份'); return; }
      if (!confirm(`发现 ${orphans.length} 个"当前读不到的预设"的备份：\n\n${orphans.join('\n')}\n\n要清理掉吗？`)) return;
      for (const n of orphans) {
        await clearBackups(n);
      }
      if (window.toastr) window.toastr.success('已清理 ' + orphans.length + ' 个孤儿备份');
      renderBackupUI();
    });

    // 回档
    $container.on('click', '.wi-bk-restore', async function (e) {
      e.stopPropagation();
      const name = $(this).attr('data-name');
      const id = $(this).attr('data-id');
      const data = await getBackupData(name, id);
      if (!data) { alert('快照数据已丢失，无法撤销'); return; }
      if (!confirm(`确定用这份快照回档「${name}」？\n\n当前版本会被覆盖（回档前会自动再存一份当前状态作为保险）。`)) return;

      // 回档前把"当前状态"再备一份，防止误回档
      if (getAllPresetNames().includes(name)) {
        await createBackup(name, '回档前快照');
      }

      const ok = await writePreset(name, JSON.parse(JSON.stringify(data)));
      if (ok) {
        if (window.toastr) window.toastr.success('已回档：' + name);
        // 如果回档的是当前加载的预设，热重载
        try {
          const cur = getCurrentPresetName();
          if (cur === name && typeof window.loadPreset === 'function') {
            window.loadPreset(cur);
          }
        } catch (err) { }
        renderBackupUI();
      } else {
        alert('回档写入失败，看 F12');
      }
    });

    // 只导出某个预设的备份
    $container.on('click', '.wi-bk-export-one', function (e) {
      e.stopPropagation();
      const name = $(this).attr('data-name');
      exportBackupsToFile([name]);
    });

    // 删除单份
    $container.on('click', '.wi-bk-delete', async function (e) {
      e.stopPropagation();
      const name = $(this).attr('data-name');
      const id = $(this).attr('data-id');
      if (!confirm('删除这份快照？')) return;
      await deleteBackup(name, id);
      renderBackupUI();
    });
  }

  function renderSutureUI() {
    const html = `
      <div style="font-size:15px;font-weight:700;color:var(--wi-accent);margin-bottom:12px">🔗 psycho缝合</div>

      <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:8px;padding:14px;margin-bottom:14px">
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;color:var(--wi-text-dim)">源类型</span>
            <select id="wi_ps_suture_source_type" style="${INPUT_CSS}width:110px;color-scheme:var(--SmartThemeColorScheme, dark)">
              <option value="preset">预设</option>
              <option value="worldbook">世界书</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;color:var(--wi-text-dim)">源</span>
            <select id="wi_ps_suture_source_sel" style="${INPUT_CSS}width:220px;color-scheme:var(--SmartThemeColorScheme, dark)"></select>
          </div>
          <span style="color:var(--wi-accent);font-size:18px">→</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;color:var(--wi-text-dim)">目标预设</span>
            <select id="wi_ps_suture_target_sel" style="${INPUT_CSS}width:220px;color-scheme:var(--SmartThemeColorScheme, dark)"></select>
          </div>
          <button id="wi_ps_suture_swap" style="${BTN_CSS}">⇄ 交换</button>
          <button id="wi_ps_suture_import_json" style="${BTN_AI_CSS}">📂 导入 JSON 当源</button>
          <button id="wi_ps_suture_paste" style="${BTN_AI_CSS}">📋 粘贴缝合</button>
          <button id="wi_ps_suture_tutorial" style="${BTN_AI_CSS}">📖 教程缝合</button>
        </div>
      </div>

      <div id="wi_ps_suture_struct" style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:8px;padding:14px;margin-bottom:14px;display:none">
        <div style="font-size:13px;color:var(--wi-text);font-weight:600;margin-bottom:10px">📋 目标预设结构分析</div>
        <div id="wi_ps_suture_struct_body"></div>
      </div>

      <div id="wi_ps_suture_body" style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:8px;padding:14px">
        <div style="color:var(--wi-text-dim);text-align:center;padding:40px;font-size:12px">
          请在上方选择源预设和目标预设
        </div>
      </div>

      <details id="wi_ps_ai_config_details" style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:8px;margin-top:14px;padding:0" open>
        <summary style="padding:10px 14px;cursor:pointer;font-size:12px;color:var(--wi-accent-2);font-weight:600;user-select:none">
          🤖 AI 辅助配置
        </summary>
        <div style="padding:0 14px 14px">
          <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:10px;line-height:1.6">
            填 OpenAI 兼容接口。常用：<br>
            DeepSeek → <code style="background:var(--wi-bg-0);padding:1px 4px;border-radius:3px">https://api.deepseek.com/v1/chat/completions</code>，模型 <code style="background:var(--wi-bg-0);padding:1px 4px;border-radius:3px">deepseek-chat</code><br>
            硅基流动 → <code style="background:var(--wi-bg-0);padding:1px 4px;border-radius:3px">https://api.siliconflow.cn/v1/chat/completions</code>
          </div>
          <div style="${LABEL_CSS}">API URL（完整路径，带 /chat/completions）</div>
          <input id="wi_ps_ai_url" placeholder="https://api.deepseek.com/v1/chat/completions" style="${INPUT_CSS}">
          <div style="${LABEL_CSS}">API Key（可留空）</div>
          <input id="wi_ps_ai_key" type="password" placeholder="sk-..." style="${INPUT_CSS}">
          <div style="${LABEL_CSS}">模型名</div>
          <input id="wi_ps_ai_model" placeholder="deepseek-chat" style="${INPUT_CSS}">
          <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
            <button id="wi_ps_ai_save" style="${BTN_PRIMARY_CSS}">💾 保存</button>
            <button id="wi_ps_ai_fetch_models" style="${BTN_CSS}">📋 拉取模型</button>
            <button id="wi_ps_ai_test" style="${BTN_CSS}">🧪 测试连接</button>
          </div>
          <div id="wi_ps_ai_status" style="margin-top:8px;font-size:11px;color:var(--wi-text-dim)"></div>
          <div id="wi_ps_ai_models_wrap" style="display:none;margin-top:10px">
            <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:4px">模型列表（点击选择）</div>
            <div id="wi_ps_ai_models" style="max-height:200px;overflow-y:auto;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:2px"></div>
          </div>
        </div>
      </details>
    `;

    $('#wi_ps_suture_content').html(html);

    const $src = $('#wi_ps_suture_source_sel').empty();
    const $tgt = $('#wi_ps_suture_target_sel').empty();
    const $srcType = $('#wi_ps_suture_source_type');

    // 目标始终是预设
    state.presets.forEach(n => {
      $tgt.append($('<option>').val(n).text(n));
    });

    // 源：按类型填
    function fillSourceOptions() {
      $src.empty();
      if (state.sutureSourceType === 'worldbook') {
        let wbNames = [];
        try {
          if (typeof getWorldbookNames === 'function') wbNames = getWorldbookNames() || [];
        } catch (e) { console.warn('[缝合器][世界书] getWorldbookNames 失败', e); }
        wbNames.forEach(n => $src.append($('<option>').val(n).text(n)));
        if (!state.sutureSource || !wbNames.includes(state.sutureSource)) {
          state.sutureSource = wbNames[0] || null;
        }
      } else {
        state.presets.forEach(n => $src.append($('<option>').val(n).text(n)));
        if (!state.sutureSource || !state.presets.includes(state.sutureSource)) {
          state.sutureSource = state.presets[0] || null;
        }
      }
      $src.val(state.sutureSource || '');
    }

    $srcType.val(state.sutureSourceType);
    fillSourceOptions();

    if (!state.sutureTarget || !state.presets.includes(state.sutureTarget)) {
      state.sutureTarget = state.presets[1] || state.presets[0] || null;
    }
    $tgt.val(state.sutureTarget || '');

    $srcType.on('change', function () {
      state.sutureSourceType = $(this).val() || 'preset';
      // 切类型时清空源，避免名字撞车
      state.sutureSource = null;
      fillSourceOptions();
      loadSutureSource();
    });

    $src.on('change', function () {
      state.sutureSource = $(this).val();
      loadSutureSource();
    });
    $tgt.on('change', function () {
      state.sutureTarget = $(this).val();
      loadSutureTarget();
      scanAndRenderStructure();
    });
    $('#wi_ps_suture_swap').on('click', () => {
      const a = state.sutureSource;
      state.sutureSource = state.sutureTarget;
      state.sutureTarget = a;
      $src.val(state.sutureSource || '');
      $tgt.val(state.sutureTarget || '');
      state.suturePick = {};
      loadSutureSource();
      loadSutureTarget();
      scanAndRenderStructure();
    });

    // ★ 导入 JSON 当源预设
    $('#wi_ps_suture_import_json').on('click', () => {
      if (!state.sutureTarget || !state.sutureTargetPreset) {
        alert('请先选目标预设');
        return;
      }
      importSourcePresetFromJson();
    });

    // ★ 教程缝合
    $('#wi_ps_suture_tutorial').on('click', () => {
      if (!state.sutureTarget || !state.sutureTargetPreset) {
        alert('请先选目标预设');
        return;
      }
      if (!state.sutureTargetStructure) {
        alert('目标预设结构未加载');
        return;
      }
      if (!isAiConfigReady()) {
        alert('未配置 AI');
        return;
      }
      showTutorialSutureDialog();
    });

    // ★ 粘贴缝合（独立弹窗）
    $('#wi_ps_suture_paste').on('click', () => {
      if (!state.sutureTarget || !state.sutureTargetPreset) {
        alert('请先选目标预设');
        return;
      }
      if (!state.sutureTargetStructure) {
        alert('目标预设结构未加载');
        return;
      }
      showPasteSutureDialog();
    });

    if (state.sutureSource && state.sutureTarget) {
      loadSutureSource();
      loadSutureTarget();
      scanAndRenderStructure();
    }

    (function bindAiConfig() {
      const $status = $('#wi_ps_ai_status');
      const $modelsWrap = $('#wi_ps_ai_models_wrap');
      const $models = $('#wi_ps_ai_models');

      function renderStatus(text, color) {
        $status.html(text).css('color', color || 'var(--wi-text-dim)');
      }

      function readForm() {
        return {
          url: $('#wi_ps_ai_url').val().trim(),
          key: $('#wi_ps_ai_key').val().trim(),
          model: $('#wi_ps_ai_model').val().trim(),
        };
      }

      const saved = loadAiConfig();
      $('#wi_ps_ai_url').val(saved.url);
      $('#wi_ps_ai_key').val(saved.key);
      $('#wi_ps_ai_model').val(saved.model);
      if (saved.url) renderStatus('已加载保存的配置', 'var(--wi-text-dim)');

      $('#wi_ps_ai_save').on('click', () => {
        const cfg = readForm();
        saveAiConfig(cfg);
        renderStatus('✅ 已保存', 'var(--wi-ok)');
        if (window.toastr) window.toastr.success('AI 配置已保存');
        if (state.sutureTargetStructure) renderStructurePanel(state.sutureTargetStructure);
      });

      $('#wi_ps_ai_test').on('click', async () => {
        const cfg = readForm();
        if (!isAiConfigReady(cfg)) {
          renderStatus('❌ URL 和模型名必填', 'var(--wi-err)');
          return;
        }
        saveAiConfig(cfg);
        renderStatus('⏳ 测试中…', 'var(--wi-accent)');
        try {
          const content = await callAuxApi(
            [{ role: 'user', content: '请只回复两个字：成功' }],
            { temperature: 0, max_tokens: 20 }
          );
          renderStatus(`✅ 连接成功！模型回复：${escapeHtml(content.trim())}`, 'var(--wi-ok)');
        } catch (e) {
          renderStatus(`❌ 失败：${escapeHtml(e.message || String(e))}`, 'var(--wi-err)');
        }
      });

      $('#wi_ps_ai_fetch_models').on('click', async () => {
        const cfg = readForm();
        if (!cfg.url) { renderStatus('❌ 先填 API URL', 'var(--wi-err)'); return; }
        saveAiConfig(cfg);
        renderStatus('⏳ 正在拉取模型列表…', 'var(--wi-accent)');
        $modelsWrap.hide();
        $models.empty();
        try {
          const list = await fetchModelList(cfg);
          if (list.length === 0) {
            renderStatus('⚠️ 返回的模型列表为空', 'var(--wi-warn)');
            return;
          }
          list.sort((x, y) => x.localeCompare(y));
          const current = cfg.model;
          if (current && list.includes(current)) {
            list.splice(list.indexOf(current), 1);
            list.unshift(current);
          }
          $modelsWrap.show();
          list.forEach(modelName => {
            const isCurrent = modelName === current;
            const $item = $(`
              <div style="padding:5px 8px;font-size:11px;color:${isCurrent ? 'var(--wi-ok)' : 'var(--wi-text)'};cursor:pointer;border-radius:4px;background:${isCurrent ? 'var(--wi-bg-2)' : 'transparent'};display:flex;justify-content:space-between;align-items:center">
                <span style="font-family:monospace;word-break:break-all">${escapeHtml(modelName)}</span>
                ${isCurrent ? '<span style="font-size:10px;color:var(--wi-ok)">✓ 当前</span>' : ''}
              </div>
            `);
            $item.on('mouseenter', function () {
              if (!isCurrent) $(this).css('background', 'var(--wi-bg-2)');
            }).on('mouseleave', function () {
              if (!isCurrent) $(this).css('background', 'transparent');
            }).on('click', () => {
              $('#wi_ps_ai_model').val(modelName);
              const newCfg = readForm();
              saveAiConfig(newCfg);
              if (window.toastr) window.toastr.success('已填入模型：' + modelName);
              renderStatus(`✅ 已选模型 <b style="color:var(--wi-ok)">${escapeHtml(modelName)}</b>`, 'var(--wi-ok)');
              $('#wi_ps_ai_fetch_models').trigger('click');
            });
            $models.append($item);
          });
          renderStatus(`✅ 拉到 ${list.length} 个模型，点击选择`, 'var(--wi-ok)');
        } catch (e) {
          if (String(e.message || e).includes('404')) {
            renderStatus(`❌ 该 API 不支持 <code>/models</code> 接口（HTTP 404）<br><span style="color:var(--wi-text-dim)">请手动填模型名</span>`, 'var(--wi-err)');
          } else {
            renderStatus(`❌ 拉取失败：${escapeHtml(e.message || String(e))}`, 'var(--wi-err)');
          }
        }
      });
    })();
  }

  // ★ 读取世界书，转成虚拟源预设（复用现有缝合流程）
  async function readWorldbookAsPreset(name) {
    if (typeof getWorldbook !== 'function') {
      console.warn('[缝合器][世界书] getWorldbook 不存在');
      return null;
    }
    let arr;
    try {
      arr = await getWorldbook(name);
    } catch (e) {
      console.error('[缝合器][世界书] getWorldbook 失败:', e);
      return null;
    }
    if (!Array.isArray(arr)) {
      console.warn('[缝合器][世界书] getWorldbook 返回不是数组:', arr);
      return null;
    }
    const prompts = arr.map((e, i) => ({
      identifier: 'wb_' + (e.uid !== undefined ? e.uid : i),
      name: e.name || '(未命名世界书条目)',
      content: e.content || '',
      role: 'system',
      enabled: e.enabled !== false,
      _fromWorldbook: true,
      _wbUid: e.uid,
    }));
    return {
      // 假造一个 legacy 预设结构
      prompts: prompts,
      _isWorldbook: true,
      _wbName: name,
      _wbRaw: arr,
    };
  }

  async function loadSutureSource() {
    if (!state.sutureSource) return;

    if (state.sutureSourceType === 'worldbook') {
      $('#wi_ps_suture_body').html('<div style="color:var(--wi-text-dim);text-align:center;padding:40px;font-size:12px">正在读取世界书…</div>');
      const vp = await readWorldbookAsPreset(state.sutureSource);
      if (!vp) {
        $('#wi_ps_suture_body').html('<div style="color:var(--wi-err);padding:20px">读取世界书失败（看 F12）</div>');
        return;
      }
      state.sutureSourcePreset = vp;
      state.suturePick = {};
      renderSutureBody();
      return;
    }

    const preset = readPreset(state.sutureSource);
    if (!preset) {
      $('#wi_ps_suture_body').html('<div style="color:var(--wi-err);padding:20px">读取源预设失败</div>');
      return;
    }
    state.sutureSourcePreset = preset;
    state.suturePick = {};
    renderSutureBody();
  }

  function loadSutureTarget() {
    if (!state.sutureTarget) return;
    const preset = readPreset(state.sutureTarget);
    if (!preset) return;
    state.sutureTargetPreset = preset;
    renderSutureBody();
  }

  function scanAndRenderStructure() {
    if (!state.sutureTargetPreset) {
      $('#wi_ps_suture_struct').hide();
      return;
    }
    const structure = scanPresetStructure(state.sutureTargetPreset);

    const savedZones = state.sutureTargetPreset?.extensions?.wi_preset_suture_zones;
    if (Array.isArray(savedZones) && savedZones.length > 0) {
      const entries = extractOrderedEntries(state.sutureTargetPreset);
      const idToIdx = new Map();
      entries.forEach((e, i) => idToIdx.set(e.identifier, i));

      let allValid = true;
      const restoredZones = savedZones.map(z => {
        const sIdx = idToIdx.get(z.startId);
        const eIdx = idToIdx.get(z.endId);
        if (sIdx === undefined || eIdx === undefined) {
          allValid = false;
          return null;
        }
        return {
          ...z,
          startIdx: sIdx,
          endIdx: eIdx,
          entryCount: eIdx - sIdx + 1,
          allNames: entries.slice(sIdx, eIdx + 1).map(e => e.name),
          sampleNames: entries.slice(sIdx, eIdx + 1).slice(0, 8).map(e => e.name),
        };
      });

      if (allValid) {
        structure.zones = restoredZones;
        structure.detectedBy = 'ai-structure';
        log('已从预设 extensions 恢复 zones：', restoredZones.length, '个（按 id 重新定位）');
      } else {
        log('保存的 zones 部分条目已不存在 → 全部丢弃，需重分析');
      }
    }

    state.sutureTargetStructure = structure;
    renderStructurePanel(structure);
    $('#wi_ps_suture_struct').show();
  }

  async function saveZonesToPreset(zones) {
    if (!state.sutureTarget || !state.sutureTargetPreset) return;
    const preset = JSON.parse(JSON.stringify(state.sutureTargetPreset));
    preset.extensions = preset.extensions || {};
    preset.extensions.wi_preset_suture_zones = zones.map(z => ({
      startIdx: z.startIdx,
      endIdx: z.endIdx,
      name: z.name,
      zoneType: z.zoneType || 'other',
      reason: z.reason || '',
      entryCount: z.entryCount || (z.endIdx - z.startIdx + 1),
      startId: z.startId || '',
      endId: z.endId || '',
      allNames: z.allNames || [],
    }));
    preset.extensions.wi_preset_suture_meta = {
      savedAt: Date.now(),
      totalEntries: extractOrderedEntries(preset).length,
    };

    log('准备写入预设：', state.sutureTarget, '字段数：', Object.keys(preset).length);
    const ok = await writePreset(state.sutureTarget, preset);
    log('写入结果：', ok);
    if (ok) {
      const check = readPreset(state.sutureTarget);
      const okZones = !!(check?.extensions?.wi_preset_suture_zones?.length);
      log('读回验证 zones：', okZones ? '✅ 有' : '❌ 无');
      state.sutureTargetPreset = preset;
    } else {
      err('保存 zones 到预设失败');
    }
  }

  function renderStructurePanel(structure) {
    if (!structure) {
      $('#wi_ps_suture_struct_body').html('<div style="color:var(--wi-text-dim);padding:10px">扫描失败</div>');
      return;
    }

    let varInitEntry = structure.varInitEntry;
    if (state.sutureManualOverride.varInitId) {
      const manual = extractOrderedEntries(state.sutureTargetPreset).find(e => e.identifier === state.sutureManualOverride.varInitId);
      if (manual) {
        const sv = parseSetVars(manual.prompt.content || '');
        const empty = sv.filter(x => !isAssignmentSetVar(x));
        varInitEntry = { identifier: manual.identifier, name: manual.name, varCount: empty.length, setVars: empty, _manual: true };
      }
    }

    const aiReady = isAiConfigReady();

    let html = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:12px;color:var(--wi-ok);font-weight:600">✅ 获取变量区</div>
            <button class="wi-ps-override-varinit" style="${BTN_CSS}padding:2px 8px;font-size:10px">手动指定</button>
          </div>
          ${varInitEntry ? `
            <div style="font-size:11px;color:var(--wi-text);line-height:1.7">
              · 条目：<b style="color:var(--wi-ok)">${escapeHtml(varInitEntry.name)}</b>${varInitEntry._manual ? ' <span style="color:var(--wi-warn)">[手动]</span>' : ''}<br>
              · 含 <b>${varInitEntry.varCount}</b> 个空 setvar<br>
              · <span style="color:var(--wi-ok)">模式：变量缝合（setvar + getvar）</span>
            </div>
          ` : `
            <div style="font-size:11px;color:var(--wi-warn);line-height:1.7">
              ⚠️ 未自动识别到"获取变量区"<br>
              · <span style="color:var(--wi-warn)">模式：普通缝合（用 &lt;标签&gt; 包裹，不挂 getvar）</span>
            </div>
          `}
        </div>

        <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">
            <div style="font-size:12px;color:var(--wi-accent-2);font-weight:600">
              📁 分区（${structure.zones.length} 个）
              <span style="font-size:10px;color:var(--wi-text-dim);font-weight:400">
                ${structure.detectedBy === 'ai-structure' ? '来源：AI 分析' :
        structure.detectedBy === 'divider' ? '来源：分割线预切（可点右侧 AI 按钮覆盖）' :
          structure.detectedBy === 'fallback' ? '⚠️ 无分割线，建议点右侧 AI 按钮分析' :
            '未知'}
              </span>
            </div>
            <button class="wi-ps-rescan-structure" style="${BTN_CSS}padding:2px 10px;font-size:11px">🔄 重扫（分割线）</button>
            <button class="wi-ps-run-ai-structure" style="${BTN_AI_CSS}padding:2px 10px;font-size:11px" ${aiReady ? '' : 'disabled title="未配置 AI"'}>🤖 AI 分析结构</button>
          </div>
          ${!aiReady ? `
            <div style="font-size:11px;color:var(--wi-warn);padding:8px;background:var(--wi-bg-2);border-radius:4px;line-height:1.6">
              ⚠️ 未配置 AI。请先在下方"🤖 AI 辅助配置"里填 API，然后才能分析结构。
            </div>
          ` : ''}
          <div style="font-size:11px;color:var(--wi-text);line-height:1.8;max-height:300px;overflow-y:auto">
            ${structure.zones.map(z => `
              <details style="padding:4px 0;border-bottom:1px dashed var(--wi-border-soft)">
                <summary style="cursor:pointer;list-style:none">
                  · <b style="color:${z.zoneType === 'cot' ? 'var(--wi-accent-2)' : 'var(--wi-accent-2)'}">${escapeHtml(z.name)}</b>
                  ${z.zoneType === 'cot' ? '<span style="font-size:9px;color:var(--wi-accent);background:var(--wi-bg-2);padding:1px 5px;border-radius:3px;margin-left:4px">COT</span>' : ''}
                  <span style="color:var(--wi-text-dim)">(第 ${z.startIdx + 1}~${z.endIdx + 1} 条，共 ${z.entryCount} 条)</span>
                  <span style="color:var(--wi-text-faint);font-size:10px;margin-left:6px">▶ 展开看成员</span>
                </summary>
                ${z.reason ? `<div style="font-size:10px;color:var(--wi-text-dim);margin-left:12px;margin-top:4px">${escapeHtml(z.reason)}</div>` : ''}
                <div style="font-size:10px;color:var(--wi-text-dim);margin-left:12px;margin-top:4px;line-height:1.7;background:var(--wi-bg-0);padding:6px 8px;border-radius:4px;max-height:150px;overflow-y:auto">
                  ${(z.allNames || []).map((n, i) => `<div>${z.startIdx + 1 + i}. ${escapeHtml(n)}</div>`).join('')}
                </div>
              </details>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    $('#wi_ps_suture_struct_body').html(html);

    $('.wi-ps-override-varinit').on('click', () => {
      const targetEntries = extractOrderedEntries(state.sutureTargetPreset);
      const input = prompt(
        '输入条目名（留空清空）：\n\n' +
        targetEntries.slice(0, 40).map((e, i) => `${i + 1}. ${e.name}`).join('\n'),
        state.sutureManualOverride.varInitId
          ? targetEntries.find(e => e.identifier === state.sutureManualOverride.varInitId)?.name
          : ''
      );
      if (input === null) return;
      if (!input.trim()) {
        state.sutureManualOverride.varInitId = null;
        saveSutureOverride();
        scanAndRenderStructure();
        return;
      }
      const found = targetEntries.find(e => e.name === input.trim());
      if (!found) { alert('没找到同名条目'); return; }
      state.sutureManualOverride.varInitId = found.identifier;
      saveSutureOverride();
      scanAndRenderStructure();
    });

    // 重扫（先清 extensions 里的 zones，再用分割线重扫）
    $('.wi-ps-rescan-structure').on('click', async () => {
      if (!state.sutureTargetPreset || !state.sutureTarget) return;
      if (!confirm('清掉当前 zones，按分割线重新扫描？')) return;

      const preset = JSON.parse(JSON.stringify(state.sutureTargetPreset));
      if (preset.extensions) {
        delete preset.extensions.wi_preset_suture_zones;
        delete preset.extensions.wi_preset_suture_meta;
      }
      const ok = await writePreset(state.sutureTarget, preset);
      if (!ok) { alert('清 zones 失败'); return; }

      state.sutureTargetPreset = readPreset(state.sutureTarget);
      // 强制不走 extensions 恢复，直接走 scanPresetStructure
      const structure = scanPresetStructure(state.sutureTargetPreset);
      state.sutureTargetStructure = structure;
      renderStructurePanel(structure);

      if (structure.detectedBy === 'divider') {
        await saveZonesToPreset(structure.zones);
        if (window.toastr) window.toastr.success(`分割线预切 ${structure.zones.length} 个 zone（已保存）`);
      } else {
        alert('分割线太少，需要 AI 介入。请点右侧「🤖 AI 分析结构」。');
      }
    });

    // AI 分析结构
    $('.wi-ps-run-ai-structure').on('click', async () => {
      if (!isAiConfigReady()) {
        alert('还没配置 AI。请先在缝合面板底部填 API。');
        return;
      }
      const entries = extractOrderedEntries(state.sutureTargetPreset);
      if (entries.length === 0) { alert('目标预设没有条目'); return; }
      const names = entries.map(e => e.name || '(无名称)');

      $('#wi_ps_suture_struct_body').html(
        `<div style="color:var(--wi-accent);font-size:12px;padding:20px;text-align:center">🤖 AI 正在分析预设结构（共 ${names.length} 条）…<br><span style="color:var(--wi-text-dim);font-size:11px">可能需要 10~30 秒</span></div>`
      );

      const r = await aiAnalyzeStructure(names);

      if (r.error) {
        alert('AI 分析失败：' + r.error + (r.raw ? '\n\n原始返回：\n' + r.raw.slice(0, 500) : ''));
        scanAndRenderStructure();
        return;
      }

      // ★ 用 identifiers 给 AI 返回的 zones 补 startId/endId
      const targetEntries = extractOrderedEntries(state.sutureTargetPreset);
      r.zones.forEach(z => {
        z.startId = targetEntries[z.startIdx]?.identifier || '';
        z.endId = targetEntries[z.endIdx]?.identifier || '';
      });

      const structure = state.sutureTargetStructure;
      structure.zones = r.zones;
      structure.detectedBy = 'ai-structure';
      renderStructurePanel(structure);

      await saveZonesToPreset(r.zones);

      if (window.toastr) window.toastr.success(`AI 切出 ${r.zones.length} 个分区（已保存）`);
    });
  }
  // ============================================================
  // [PASTE SUTURE] 粘贴缝合（独立模块）
  // ============================================================
  function showPasteSutureDialog() {
    const MASK_ID = 'wi_ps_paste_mask';
    __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

    const $mask = $('<div id="' + MASK_ID + '">').css({
      position: 'fixed', inset: 0, background: 'var(--wi-mask-strong)', zIndex: 1000050,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    const $box = $('<div>').addClass('wi-ps-mobile-box').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '10px',
      padding: '18px', width: '900px', maxWidth: '95vw', maxHeight: '92vh',
      overflow: 'auto', color: 'var(--wi-text)', boxShadow: 'var(--SmartThemeShadowColor, 0 12px 40px rgba(0,0,0,.7))',
    });

    const targetName = state.sutureTarget || '';
    const structure = state.sutureTargetStructure;
    const cotZoneName = structure?.zones?.find(z => z.zoneType === 'cot')?.name || '(未识别)';

    let html = `
      <div style="font-size:16px;font-weight:700;color:var(--wi-accent-2);margin-bottom:6px">📋 粘贴缝合（独立模式）</div>
      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:14px;line-height:1.7">
        目标预设：<b style="color:var(--wi-accent)">${escapeHtml(targetName)}</b> ｜ COT 区：<b style="color:var(--wi-accent-2)">${escapeHtml(cotZoneName)}</b>
      </div>

      <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:12px;font-size:11px;color:var(--wi-text);line-height:1.7">
        <b style="color:var(--wi-accent-2)">用法：</b>把任何内容（单个条目、多个条目、COT、杂糅）粘贴到下面。
        AI 会自动识别类型、拆分成条目、并根据目标预设结构规划插入位置。<br>
        · 普通条目会加 [来自 粘贴] 后缀<br>
        · COT 条目保留原名<br>
        · 粘贴的普通条目会优先挂 getvar 到同批次粘贴的 COT 条目
      </div>

      <div style="margin:10px 0 4px;font-size:11px;color:var(--wi-text-dim)">粘贴内容（支持任意文本）</div>
      <textarea id="wi_ps_paste_content" placeholder="在此粘贴条目、COT、或杂糅内容…" style="${INPUT_CSS}height:280px;resize:vertical;font-family:monospace;font-size:11px;line-height:1.5"></textarea>

      <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" id="wi_ps_paste_file" accept=".txt,.md,text/plain" style="display:none">
        <button id="wi_ps_paste_upload" style="${BTN_CSS}">📎 上传 .txt / .md 文件（追加到文本框）</button>
        <button id="wi_ps_paste_clear" style="${BTN_CSS}">🗑 清空</button>
        <span id="wi_ps_paste_fileinfo" style="font-size:11px;color:var(--wi-text-dim)"></span>
      </div>

      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button id="wi_ps_paste_cancel" style="${BTN_CSS}">取消</button>
        <button id="wi_ps_paste_run" style="${BTN_AI_CSS}padding:8px 24px;font-size:13px">🤖 解析并规划</button>
      </div>

      <div id="wi_ps_paste_status" style="margin-top:12px;font-size:12px;color:var(--wi-text-dim)"></div>
    `;

    $box.html(html);
    $mask.append($box);
    $('#' + PANEL_ID).append($mask);

    const $content = $box.find('#wi_ps_paste_content');
    const $status = $box.find('#wi_ps_paste_status');
    const $fileInfo = $box.find('#wi_ps_paste_fileinfo');

    function renderStatus(text, color) {
      $status.html(text).css('color', color || 'var(--wi-text-dim)');
    }

    $box.find('#wi_ps_paste_upload').on('click', () => {
      $box.find('#wi_ps_paste_file').trigger('click');
    });

    $box.find('#wi_ps_paste_file').on('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target.result || '');
        const cur = $content.val() || '';
        $content.val(cur ? (cur + '\n\n' + text) : text);
        $fileInfo.text('已追加文件：' + file.name + '（' + text.length + ' 字）');
      };
      reader.onerror = () => {
        alert('读取文件失败');
      };
      reader.readAsText(file);
      $(this).val('');
    });

    $box.find('#wi_ps_paste_clear').on('click', () => {
      $content.val('');
      $fileInfo.text('');
      renderStatus('');
    });

    $box.find('#wi_ps_paste_cancel').on('click', () => {
      if (state.pasteBusy) {
        if (!confirm('AI 正在处理中，确定要关闭吗？（不会中断请求，但你会看不到结果）')) return;
      }
      $mask.remove();
    });

    $box.find('#wi_ps_paste_run').on('click', async () => {
      const text = ($content.val() || '').trim();
      if (!text) { renderStatus('❌ 内容为空，先粘贴点东西', 'var(--wi-err)'); return; }
      if (text.length < 10) { renderStatus('❌ 内容太短，至少 10 个字符', 'var(--wi-err)'); return; }
      if (state.pasteBusy) return;
      state.pasteBusy = true;

      renderStatus('⏳ AI 正在解析 ' + text.length + ' 字内容…', 'var(--wi-accent)');
      showLoadingMask(
        '🤖 AI 正在解析粘贴内容并规划缝合…',
        '目标预设：' + targetName + '。可能需要 30~120 秒。请勿刷新页面。'
      );

      let result;
      try {
        result = await aiParsePasteAndPlan(text);
      } finally {
        hideLoadingMask();
        state.pasteBusy = false;
      }

      if (result.error) {
        renderStatus('❌ 解析失败：' + escapeHtml(result.error), 'var(--wi-err)');
        if (result.raw) {
          console.error('[缝合器][粘贴] 原始返回:', result.raw);
        }
        return;
      }

      $mask.remove();

      const plans = buildPastePlansFromAI(result.entries, text);
      if (plans.length === 0) {
        alert('AI 没解析出任何条目');
        return;
      }
      showPasteReviewTable(plans, state.sutureTargetStructure);
    });
  }

  async function aiParsePasteAndPlan(pasteText) {
    if (!isAiConfigReady()) return { entries: [], raw: '', error: '未配置 AI' };
    if (!pasteText || !pasteText.trim()) return { entries: [], raw: '', error: '内容为空' };

    const targetPreset = state.sutureTargetPreset;
    const structure = state.sutureTargetStructure;
    if (!targetPreset || !structure) return { entries: [], raw: '', error: '目标预设或结构未加载' };

    const entries = extractOrderedEntries(targetPreset);
    const zoneEntriesMap = new Map();
    structure.zones.forEach(z => {
      const names = [];
      for (let i = z.startIdx; i <= z.endIdx && i < entries.length; i++) {
        names.push(entries[i].name);
      }
      zoneEntriesMap.set(z.name, names);
    });

    const ctxVarInit = structure.varInitEntry
      ? '【获取变量区】：' + structure.varInitEntry.name
      : '（未识别到获取变量区）';

    const cotZone = structure.zones.find(z => z.zoneType === 'cot');
    let ctxCotZone = '（未识别到 COT 区）';
    let cotEnabledEntries = [];
    if (cotZone) {
      const allCotEntries = [];
      for (let i = cotZone.startIdx; i <= cotZone.endIdx && i < entries.length; i++) {
        if (entries[i]) allCotEntries.push(entries[i]);
      }
      cotEnabledEntries = allCotEntries.filter(e => e.enabled !== false);
      const listStr = cotEnabledEntries.map((e, i) => (i + 1) + '. ' + e.name).join('\n');
      ctxCotZone = '【COT区】：' + cotZone.name + '\n**已启用条目列表**（从这些里挑）：\n' + listStr + (cotEnabledEntries.length === 0 ? '（无已启用条目）' : '');
    }

    const zoneList = structure.zones.map(z => {
      const names = zoneEntriesMap.get(z.name) || [];
      const namesStr = names.slice(0, 30).map((n, i) => (z.startIdx + 1 + i) + '. ' + n).join('\n');
      const reasonStr = z.reason ? '｜' + z.reason : '';
      return '### ' + z.name + '（共 ' + names.length + ' 条' + reasonStr + '）\n' + namesStr + (names.length > 30 ? '\n...(还有 ' + (names.length - 30) + ' 条)' : '');
    }).join('\n\n');

    const sysPrompt = `你是 SillyTavern 预设缝合助手（粘贴模式）。

用户会粘贴一段**任意内容**（可能是单个条目、多个条目、COT 条目、或它们的杂糅）。
你要做两件事：
（一）**解析内容**：识别里面有哪些"条目"和"COT 条目"；
（二）**规划缝合**：为每条规划插入方案（插到目标预设的哪个分区、哪条之后）。

【目标预设结构】

${ctxVarInit}
${ctxCotZone}

【目标预设的分区】

⚠️ 注意：填写 zone 时**只填分区名本身**（比如 "COT区"、"文风区"），**不要加任何后缀**。

${zoneList}

【解析规则】

1. 识别"条目"的边界：常见形式有
   - 明确标题（[xxx] / 【xxx】 / # xxx / ## xxx / 空行分隔的段）
   - 作者用分隔线 —— 或 --- 分隔
   - 你根据内容语义判断（比如"一段独立规则"就是一个条目）
2. **COT 条目**判定：名字或内容里含 **cot / COT / CoT / 思维链 / 思考 / 推理 / thinking / think / <thinking>** 等关键词的，**当 COT 条目处理**。
3. **COT 条目里的"杂糅"**：COT 条目本身可能包含多个"子规则"（比如 <thinking> 里有一段自检逻辑）。这些子规则**作为独立条目**（**同级**），但要标记它们的 **cotParent** = 该 COT 条目的名字，让它们的 getvar 优先挂到这个 COT。
4. **名称规范**：
   - COT 条目：保留原名（不加后缀）
   - 普通条目：条目名后加 **[来自 粘贴]**（脚本会自动补，你可以在 entryName 里写基础名即可，脚本会加后缀）

【缝合规划规则】

对**每一个**解析出的条目（含 COT 条目、含子规则），给出：

1. zone：插到哪个分区（原样复制分区名）
2. insertAfter：插到该分区内哪条之后（条目名，或 __FIRST__ / __LAST__）
   - 如果条目是普通规则 → 找目标预设里同功能的条目后面
   - 如果条目是 COT 类 → 优先插到 COT 区
   - 如果条目是子规则 → 可以插到目标预设里跟子规则相关的普通分区，也可以插到父 COT 所在位置附近
3. entryName：缝合后的条目名（COT 条目保留原名；普通条目给基础名，脚本会加 [来自 粘贴] 后缀）
4. wrapVar：
   - 条目**已有 setvar** → null（保留原变量名）
   - 条目**无变量**（纯文本）→ 起一个有意义的中文变量名
   - **COT 条目如果内容里有 getvar 引用但本身没 setvar**，wrapVar 也给 null（COT 条目不包变量）
5. cotPlan（**每条都必须填**）：
   - **如果条目是普通规则类（非 COT）**：
     填 {"type": "getvar", "getvarName": "这条的变量名", "getvarTargetCot": "从【COT区已启用条目列表】里挑一个最合适的"}
     - 如果这个条目**是同批次粘贴的 COT 条目里的子规则**：getvarTargetCot 填**那个父 COT 的名字**（比如 "COT-自检"），不要填目标预设已有的
     - 否则从【COT区已启用条目列表】里挑一个
   - **如果条目是 COT 条目本身**：
     填 {"type": "none"}（COT 条目本身不需要挂 getvar）
6. **isCot**：布尔值，标记这条是不是 COT 条目
7. **cotParent**：如果是子规则，填父 COT 条目的名字；否则 null
8. reason：一句话理由

【输出格式】

只返回 JSON：
{
  "entries": [
    {
      "tempId": "1",
      "name": "破限加强",
      "content": "完整内容...",
      "isCot": false,
      "cotParent": null,
      "zone": "破限区",
      "insertAfter": "主要破限",
      "entryName": "破限加强",
      "wrapVar": "破限加强规则",
      "cotPlan": { "type": "getvar", "getvarName": "破限加强规则", "getvarTargetCot": "常规创作思维" },
      "reason": "破限规则，插在主要破限后"
    }
  ]
}

⚠️ 内容里如果有换行，用 \\n 表示（JSON 标准转义）。`;

    const userPrompt = '请解析以下粘贴内容并规划缝合方案：\n\n' + pasteText;

    try {
      console.log('[缝合器][粘贴] ===== 发起解析请求 =====');
      console.log('[缝合器][粘贴] 粘贴内容长度:', pasteText.length);
      const content = await callAuxApi(
        [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, max_tokens: 40000 }
      );
      console.log('[缝合器][粘贴] ===== 返回 =====');
      console.log('[缝合器][粘贴原始返回]', content);

      const parsed = extractJsonFromAI(content);
      if (parsed && Array.isArray(parsed.entries)) {
        return { entries: parsed.entries, raw: content, error: null };
      }
      return { entries: [], raw: content, error: 'AI 返回格式无法解析' };
    } catch (e) {
      return { entries: [], raw: '', error: '请求失败：' + (e.message || e) };
    }
  }

  function buildPastePlansFromAI(aiEntries, originalText) {
    const structure = state.sutureTargetStructure;
    const plans = [];
    const allTargetEntries = extractOrderedEntries(state.sutureTargetPreset);

    const pastedCotNames = new Set();
    aiEntries.forEach(e => {
      if (e.isCot) pastedCotNames.add(e.name);
    });

    aiEntries.forEach((e, i) => {
      const zoneName = String(e.zone || '').trim();
      let zoneObj = structure.zones.find(z => z.name === zoneName);
      if (!zoneObj && zoneName) {
        const cleaned = zoneName.replace(/\s*[【\[（(].+?[】\]）)]\s*$/, '').trim();
        zoneObj = structure.zones.find(z => z.name === cleaned);
      }
      if (!zoneObj && e.isCot) {
        zoneObj = structure.zones.find(z => z.zoneType === 'cot');
      }

      let finalEntryName = e.entryName || e.name || '新条目';
      if (!e.isCot && !finalEntryName.includes('[来自')) {
        finalEntryName = finalEntryName + ' [来自 粘贴]';
      }

      let cotPlan = e.cotPlan || { type: 'none' };
      if (cotPlan.type === 'getvar') {
        const target = cotPlan.getvarTargetCot || '';
        const targetInPreset = structure.zones
          .filter(z => z.zoneType === 'cot')
          .some(z => {
            for (let k = z.startIdx; k <= z.endIdx; k++) {
              const ent = allTargetEntries[k];
              if (ent && ent.name === target) return true;
            }
            return false;
          });
        const targetInPasted = pastedCotNames.has(target);
        if (!targetInPreset && !targetInPasted && target) {
          console.warn('[缝合器][粘贴] 「' + e.name + '」getvar 目标「' + target + '」不存在，清空走兜底');
          cotPlan = { ...cotPlan, getvarTargetCot: '' };
        }
      }

      plans.push({
        sourceId: 'paste_' + (e.tempId || i) + '_' + Math.random().toString(36).slice(2, 8),
        sourceIndex: i + 1,
        sourceName: e.name || '(未命名)',
        sourceContent: String(e.content || ''),
        _sutureFrom: '粘贴',   // ★ 粘贴缝合的来源标记
        zone: zoneObj ? zoneObj.name : zoneName,
        zoneObj: zoneObj,
        insertAfter: e.insertAfter || '__LAST__',
        entryName: finalEntryName,
        wrapVar: e.wrapVar || null,
        cotPlan: cotPlan,
        reason: e.reason || '',
        _isPaste: true,
        _isCot: !!e.isCot,
        _cotParent: e.cotParent || null,
      });
    });

    return plans;
  }

  function showPasteReviewTable(plans, structure) {
    let html = '<div style="font-size:14px;font-weight:700;color:var(--wi-accent-2);margin-bottom:10px">📋 粘贴缝合方案（' + plans.length + ' 条）</div>';
    html += '<div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:10px">AI 已解析并规划。审阅下面的方案，可以直接改。确认后执行写入。</div>';

    html += '<div style="max-height:560px;overflow-y:auto;border:1px solid var(--wi-border-soft);border-radius:6px">';
    plans.forEach((r, i) => {
      const isCot = !!r._isCot;
      const isSub = !!r._cotParent;
      const zoneOk = !!r.zoneObj;
      html += `
        <div class="wi-ps-paste-review-row" data-idx="${i}" style="padding:10px;border-bottom:1px solid var(--wi-border-soft)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:11px;color:var(--wi-accent-2)">#${i + 1}</span>
            ${isCot ? '<span style="font-size:10px;color:var(--wi-accent);background:var(--wi-bg-2);padding:1px 5px;border-radius:3px">COT</span>' : ''}
            ${isSub ? '<span style="font-size:10px;color:var(--wi-warn);background:var(--wi-bg-2);padding:1px 5px;border-radius:3px">子规则 → ' + escapeHtml(r._cotParent) + '</span>' : ''}
            <span style="font-size:12px;color:var(--wi-text);font-weight:600">${escapeHtml(r.sourceName)}</span>
            <span style="color:var(--wi-text-faint);font-size:10px">→ ${escapeHtml(
              state.sutureNameSuffix && r._sutureFrom && !/\[来自.+?\]\s*$/.test(r.entryName)
                ? r.entryName + ' [来自' + r._sutureFrom + ']'
                : r.entryName
            )}</span>
          </div>
          <div style="font-size:11px;color:var(--wi-text-dim);line-height:1.7;margin-bottom:6px">
            <b style="color:var(--wi-ok)">zone：</b>${escapeHtml(r.zone)}${zoneOk ? '' : ' <span style="color:var(--wi-err)">（⚠️ 不在 zone 列表）</span>'}
            &nbsp;·&nbsp;<b style="color:var(--wi-ok)">插到：</b>${escapeHtml(r.insertAfter === '__LAST__' ? '（区末尾）' : r.insertAfter === '__FIRST__' ? '（区开头）' : r.insertAfter)}
            ${r.wrapVar ? '&nbsp;·&nbsp;<b style="color:var(--wi-ok)">变量名：</b>' + escapeHtml(r.wrapVar) : ''}
            ${r.cotPlan.type === 'getvar' ? '&nbsp;·&nbsp;<b style="color:var(--wi-accent-2)">getvar →</b> ' + escapeHtml(r.cotPlan.getvarTargetCot || '（自动兜底）') : ''}
          </div>
          <div style="font-size:10px;color:var(--wi-text-dim);margin-bottom:6px">理由：${escapeHtml(r.reason)}</div>
          <details style="margin-bottom:6px">
            <summary style="cursor:pointer;font-size:10px;color:var(--wi-text-faint)">查看内容（前 500 字）</summary>
            <textarea readonly style="width:100%;height:100px;background:var(--wi-bg-0);color:var(--wi-text-dim);border:1px solid var(--wi-border-soft);border-radius:4px;padding:6px;box-sizing:border-box;font-family:monospace;font-size:10px;margin-top:4px">${escapeHtml(String(r.sourceContent || '').slice(0, 500), 999999)}</textarea>
          </details>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="wi-ps-paste-review-edit" data-idx="${i}" style="${BTN_CSS}padding:3px 10px;font-size:11px">✏️ 编辑</button>
            <button class="wi-ps-paste-review-skip" data-idx="${i}" style="${BTN_CSS}padding:3px 10px;font-size:11px">跳过这条</button>
          </div>
        </div>
      `;
    });
    html += '</div>';

    html += `
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button id="wi_ps_paste_review_cancel" style="${BTN_CSS}">取消</button>
        <button id="wi_ps_paste_review_execute" style="${BTN_PRIMARY_CSS}padding:8px 24px;font-size:13px">✅ 全部确认并写入</button>
      </div>
    `;

    showModal(html, ($m) => {
      $m.find('#wi_ps_paste_review_cancel').on('click', () => $m.closest('#wi_ps_modal_mask').remove());

      $m.find('#wi_ps_paste_review_execute').on('click', async () => {
        $m.closest('#wi_ps_modal_mask').remove();
        await executeAiSuture(plans, state.sutureTargetStructure);
      });

      $m.find('.wi-ps-paste-review-skip').on('click', function () {
        const idx = parseInt($(this).data('idx'), 10);
        plans[idx]._skipped = true;
        $(this).closest('.wi-ps-paste-review-row').css('opacity', 0.4);
        $(this).prop('disabled', true).text('已跳过');
      });

      $m.find('.wi-ps-paste-review-edit').on('click', function () {
        const idx = parseInt($(this).data('idx'), 10);
        editSuturePlanRow(plans[idx], structure, () => {
          $m.closest('#wi_ps_modal_mask').remove();
          showPasteReviewTable(plans.filter(x => !x._skipped), structure);
        });
      });
    });
  }

  // ============================================================
  // [IMPORT JSON] 导入 JSON 预设当源
  // ============================================================
  function importSourcePresetFromJson() {
    // ★ 把 input 挂到 body 上（某些环境对 detached input 创建的 FileReader 会报错）
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = () => {
      const file = input.files && input.files[0];
      // 先保留 input 在 DOM，等 FileReader 读完再移除
      if (!file) {
        try { document.body.removeChild(input); } catch (e) { }
        return;
      }

      const reader = new FileReader();

      const cleanup = () => {
        try { document.body.removeChild(input); } catch (e) { }
      };

      reader.onload = (e) => {
        cleanup();
        const text = String(e.target.result || '');
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          alert('❌ JSON 解析失败：' + (err.message || err));
          return;
        }
        if (!parsed || typeof parsed !== 'object') {
          alert('❌ JSON 顶层不是对象');
          return;
        }

        // ★ 判断格式：预设 vs 世界书
        if (Array.isArray(parsed.prompts)) {
          handleImportedPreset(parsed, file.name);
        } else if (parsed.entries && typeof parsed.entries === 'object') {
          const converted = convertWorldbookJsonToPreset(parsed, file.name);
          if (!converted) {
            alert('❌ 世界书 JSON 解析失败（没读到任何条目）');
            return;
          }
          handleImportedPreset(converted, file.name + '（世界书）');
        } else {
          alert('❌ 无法识别的 JSON 格式\n\n既不是预设（没有 prompts 数组），也不是世界书（没有 entries 对象）');
        }
      };

      reader.onerror = () => {
        cleanup();
        alert('❌ 读取文件失败');
      };

      reader.readAsText(file);
    };

    input.click();
  }

  // ★ 把世界书 JSON 转成预设结构，复用后续流程
  // 世界书 JSON 格式：
  //   { "entries": { "0": { "uid": 0, "key": [...], "keysecondary": [...],
  //                        "comment": "条目名", "content": "内容", "disable": false, ... }, ... } }
  // 预设结构：
  //   { "prompts": [ { identifier, name, content, enabled, role }, ... ] }
  function convertWorldbookJsonToPreset(wbJson, fileName) {
    const entries = wbJson.entries;
    if (!entries || typeof entries !== 'object') return null;

    // 世界书的 entries 是对象（键是序号），转成数组
    // 按 uid / 键数字 排序
    const entryList = Object.values(entries).filter(e => e && typeof e === 'object');

    if (entryList.length === 0) return null;

    // 按 uid 排序（如果没有 uid，按原始键顺序）
    entryList.sort((a, b) => {
      const ua = a.uid !== undefined ? Number(a.uid) : 0;
      const ub = b.uid !== undefined ? Number(b.uid) : 0;
      return ua - ub;
    });

    const prompts = entryList.map((e, i) => {
      const uid = e.uid !== undefined ? e.uid : i;
      const name = String(e.comment || e.name || ('条目 ' + uid));
      const content = String(e.content || '');
      // 世界书条目：多种禁用字段写法兼容
      let enabled = true;
      if (e.disable === true) enabled = false;
      else if (e.enabled === false) enabled = false;
      else if (e.enabled === true) enabled = true;
      return {
        identifier: 'wb_' + uid,
        id: 'wb_' + uid,
        name,
        content,
        role: 'system',
        enabled,
      };
    });

    return {
      prompts,
      // 保留原始世界书信息（备用）
      _wbRaw: wbJson,
      _wbName: fileName || '(导入的世界书)',
      _isWorldbook: true,
    };
  }

  function handleImportedPreset(preset, fileName) {
    // ★ 1. 决定用哪份 prompt_order
    let chosenOrder = null;
    let chosenCharId = null;
    if (Array.isArray(preset.prompt_order) && preset.prompt_order.length > 0) {
      // 取最后一个（通常是作者自定义那份）
      const last = preset.prompt_order[preset.prompt_order.length - 1];
      if (last && Array.isArray(last.order)) {
        chosenOrder = last.order;
        chosenCharId = last.character_id;
      }
    }

    // ★ 2. 构造虚拟源预设对象（给现有缝合流程用）
    //   - 把 prompts 转成带 identifier 的标准结构
    //   - 保留原字段
    const virtualPreset = JSON.parse(JSON.stringify(preset));

    // 如果用的是 legacy 路径（无 prompt_order 或空），直接用 prompts
    // 如果有 prompt_order，按它重排 prompts 并设置 enabled 标志
    if (Array.isArray(chosenOrder) && chosenOrder.length > 0) {
      // 建立 identifier -> prompt 的映射
      const idMap = new Map();
      virtualPreset.prompts.forEach(p => {
        const id = p.identifier || p.id;
        if (id) idMap.set(id, p);
      });

      // 按 chosenOrder 重排
      const newPrompts = [];
      const orderEnabledMap = new Map();
      chosenOrder.forEach(o => {
        const id = o.identifier || o.id;
        if (!id) return;
        const p = idMap.get(id);
        if (p) {
          const newP = { ...p, enabled: o.enabled !== false };
          newPrompts.push(newP);
          orderEnabledMap.set(id, o.enabled !== false);
        }
      });
      // 不在 order 里的条目，追加到末尾，enabled 保持原样（默认 false）
      virtualPreset.prompts.forEach(p => {
        const id = p.identifier || p.id;
        if (id && !orderEnabledMap.has(id)) {
          newPrompts.push({ ...p, enabled: p.enabled === true });
        }
      });

      virtualPreset.prompts = newPrompts;
      // ★ 删掉 prompt_order，强制走 legacy 路径（避免现有 getPromptOrder 又取错）
      delete virtualPreset.prompt_order;
    } else {
      // 没有 prompt_order，直接按 prompts 里的 enabled 处理
      virtualPreset.prompts = virtualPreset.prompts.map(p => ({
        ...p,
        enabled: p.enabled !== false,
      }));
    }

    // ★ 3. 统计
    const allEntries = extractOrderedEntries(virtualPreset);
    const enabledEntries = allEntries.filter(e => e.enabled !== false);

    if (enabledEntries.length === 0) {
      alert('⚠️ 该 JSON 里没有任何"已启用"的条目');
      return;
    }

    // ★ 4. 注入到 state，当成源预设
    state.sutureSourcePreset = virtualPreset;
    state.sutureSource = fileName || '(导入的 JSON)';
    state.suturePick = {};

    // ★ 5. 自动勾选"已启用"条目
    enabledEntries.forEach(e => {
      state.suturePick[e.identifier] = { checked: true };
    });

    // ★ 6. 刷新 UI
    //   1) 更新源预设 select 显示（临时加一个选项）
    const $src = $('#wi_ps_suture_source_sel');
    if ($src.length) {
      // 先移除已有的"临时导入"选项
      $src.find('option[data-imported="1"]').remove();
      // 加一个新选项
      const $opt = $('<option>')
        .val(fileName || '(导入的 JSON)')
        .text('📂 ' + (fileName || '(导入的 JSON)'))
        .attr('data-imported', '1');
      $src.prepend($opt);
      $src.val(fileName || '(导入的 JSON)');
    }

    //   2) 重新渲染缝合列表
    renderSutureBody();

    const info = '✅ 已导入 JSON：' + (fileName || '');
    const detail = '共 ' + allEntries.length + ' 条，已启用 ' + enabledEntries.length + ' 条（已自动勾选）';
    if (window.toastr) {
      window.toastr.success(info);
      setTimeout(() => window.toastr.info(detail), 300);
    } else {
      alert(info + '\n' + detail);
    }

    log('[导入 JSON] 已启用条目:', enabledEntries.map(e => e.name));
  }

  // ★ 教程缝合 token 预估
  const TUTORIAL_TOKEN_LIMIT = {
    warn: 60000,
    danger: 100000,
    block: 120000,
  };

  function estimateTokens(text) {
    if (!text) return 0;
    let cjk = 0, other = 0;
    for (const ch of String(text)) {
      if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch)) cjk++;
      else other++;
    }
    return Math.ceil(cjk * 1.5 + other * 0.4);
  }

  // 估算"一个源预设/世界书"拼进 prompt 后占的 token
  function estimateSourceTokens(entries) {
    let total = 0;
    for (const e of entries) {
      const name = e.name || '';
      const preview = String(e.content || '').slice(0, 400).replace(/\n/g, ' ');
      // 加上格式包装（编号、前缀等）约 10 token
      total += estimateTokens(name) + estimateTokens(preview) + 10;
    }
    return total;
  }

  // ★ 从教程文本里提取关键词
  function extractTutorialKeywords(tutorialText) {
    const text = String(tutorialText || '');
    const keywords = new Set();

    // 1. 引号内的词
    const quotePatterns = [
      /"([^"]{2,30})"/g,          // 英文直双引号
      /'([^']{2,30})'/g,          // 英文直单引号
      /“([^”]{2,30})”/g,          // 中文弯双引号
      /‘([^’]{2,30})’/g,          // 中文弯单引号
      /「([^」]{2,30})」/g,        // 日式角括号
      /『([^』]{2,30})』/g,        // 日式双角括号
      /【([^】]{2,30})】/g,        // 方头括号
      /《([^》]{2,30})》/g,        // 书名号
      /（([^）]{2,30})）/g,        // 圆括号（中文）
    ];
    quotePatterns.forEach(p => {
      let m;
      while ((m = p.exec(text)) !== null) {
        const kw = m[1].trim();
        if (kw) keywords.add(kw);
      }
    });

    return Array.from(keywords);
  }

  // ★ 按关键词过滤一个源的条目
  // 返回 { entries: [...], matchedBy: 'sourceName' | 'keyword' | 'none', matchedKeywords: [] }
  function filterEntriesByKeywords(entries, sourceName, tutorialText, keywords) {
    const text = String(tutorialText || '');

    // 1. 教程提到源名 → 整体加载
    if (sourceName && text.includes(sourceName)) {
      return { entries: entries, matchedBy: 'sourceName', matchedKeywords: [] };
    }

    // 2. 按关键词匹配条目
    if (keywords.length === 0) {
      return { entries: [], matchedBy: 'none', matchedKeywords: [] };
    }

    const matched = [];
    const hitKws = new Set();

    for (const e of entries) {
      const name = String(e.name || '');
      const content = String(e.content || '').slice(0, 800);
      let hit = false;
      for (const kw of keywords) {
        if (name.includes(kw) || content.includes(kw)) {
          hit = true;
          hitKws.add(kw);
        }
      }
      if (hit) matched.push(e);
    }

    return {
      entries: matched,
      matchedBy: matched.length > 0 ? 'keyword' : 'none',
      matchedKeywords: Array.from(hitKws),
    };
  }

  // ============================================================
  // [TUTORIAL SUTURE] 教程缝合
  // ============================================================
  function showTutorialSutureDialog() {
    const MASK_ID = 'wi_ps_tutorial_mask';
    __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

    const $mask = $('<div id="' + MASK_ID + '">').css({
      position: 'fixed', inset: 0, background: 'var(--wi-mask-strong)', zIndex: 1000050,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    const $box = $('<div>').addClass('wi-ps-mobile-box').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '10px',
      padding: '18px', width: '900px', maxWidth: '95vw', maxHeight: '92vh',
      overflow: 'auto', color: 'var(--wi-text)', boxShadow: 'var(--SmartThemeShadowColor, 0 12px 40px rgba(0,0,0,.7))',
    });

    const targetName = state.sutureTarget || '';

    // ★ 源预设列表
    const presetNames = state.presets || [];
    const presetChecks = presetNames.map(n => {
      const checked = state.tutorialSourceNames.includes(n) ? 'checked' : '';
      return `
        <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--wi-text);cursor:pointer;padding:3px 8px;background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:4px;margin:2px">
          <input type="checkbox" class="wi-ps-tut-src-check" data-srctype="preset" value="${escapeHtml(n)}" ${checked}>
          <span>${escapeHtml(n)}</span>
        </label>
      `;
    }).join('');

    // ★ 源世界书列表
    let worldbookNames = [];
    try {
      if (typeof getWorldbookNames === 'function') worldbookNames = getWorldbookNames() || [];
    } catch (e) { console.warn('[缝合器][教程] getWorldbookNames 失败', e); }

    const worldbookChecks = worldbookNames.map(n => {
      const checked = state.tutorialSourceNames.includes(n) ? 'checked' : '';
      return `
        <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--wi-text);cursor:pointer;padding:3px 8px;background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:4px;margin:2px">
          <input type="checkbox" class="wi-ps-tut-src-check" data-srctype="worldbook" value="${escapeHtml(n)}" ${checked}>
          <span>${escapeHtml(n)}</span>
        </label>
      `;
    }).join('');

    let html = `
      <div style="font-size:16px;font-weight:700;color:var(--wi-accent-2);margin-bottom:6px">📖 教程缝合</div>
      <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:14px;line-height:1.7">
        目标预设：<b style="color:var(--wi-accent)">${escapeHtml(targetName)}</b>
      </div>

      <div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:12px;font-size:11px;color:var(--wi-text);line-height:1.7">
        <b style="color:var(--wi-accent-2)">用法：</b>粘贴一条教程（可以包含 [1][2][3] 多条指令）。
        AI 会解析教程，从**你勾选的源预设**里找出教程提到的条目，按教程要求缝合到目标预设。<br>
        · 教程里说"翻译成英文" → AI 会翻译相关条目<br>
        · 教程里说"首尾都要改" → AI 会用标签包裹条目<br>
        · 找不到的条目 / 位置会列在最后提示
      </div>

      <div style="margin-bottom:6px;font-size:11px;color:var(--wi-text-dim)">步骤 0. 模式</div>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:12px;padding:8px 10px;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px">
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--wi-text);cursor:pointer">
          <input type="radio" name="wi_ps_tut_mode" value="full" ${!state.tutorialRetrievalMode ? 'checked' : ''}>
          <span>全量（把勾选源的全部条目给 AI，token 大但看得全）</span>
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--wi-accent-2);cursor:pointer">
          <input type="radio" name="wi_ps_tut_mode" value="retrieval" ${state.tutorialRetrievalMode ? 'checked' : ''}>
          <span>🔍 检索（只把教程提到的相关条目给 AI，省 token）</span>
        </label>
      </div>

      <div style="margin-bottom:6px;font-size:11px;color:var(--wi-text-dim)">步骤 1. 勾选教程涉及的源（可多选）</div>

      <div style="font-size:11px;color:var(--wi-accent);margin:6px 0 4px;font-weight:600">▼ 源预设（${presetNames.length} 个）</div>
      <div class="wi-ps-tut-src-box" style="max-height:120px;overflow-y:auto;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px;padding:6px;margin-bottom:10px">
        ${presetNames.length === 0 ? '<span style="color:var(--wi-text-dim);font-size:11px">没有可选预设</span>' : presetChecks}
      </div>

      <div style="font-size:11px;color:var(--wi-accent-2);margin:6px 0 4px;font-weight:600">▼ 源世界书（${worldbookNames.length} 个）</div>
      <div class="wi-ps-tut-src-box" style="max-height:120px;overflow-y:auto;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px;padding:6px;margin-bottom:10px">
        ${worldbookNames.length === 0 ? '<span style="color:var(--wi-text-dim);font-size:11px">没有可选世界书</span>' : worldbookChecks}
      </div>

      <div id="wi_ps_tut_token_est" style="font-size:11px;color:var(--wi-text-dim);margin-bottom:12px;padding:6px 8px;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:4px;line-height:1.6">
        📊 未选源
      </div>

      <div style="margin-bottom:6px;font-size:11px;color:var(--wi-text-dim)">步骤 2. 粘贴教程文本</div>
      <div style="font-size:10px;color:var(--wi-warn);margin-bottom:4px;line-height:1.6;background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:4px;padding:6px 8px">
        💡 <b>强烈建议用引号包裹条目名</b>（支持 "" '' "" '' 「」 『』 【】 《》），脚本靠引号识别条目名。<b>不加引号检索会失败</b>，只能改用全量模式。
      </div>
      <textarea id="wi_ps_tut_text" placeholder="例（注意引号）：&#10;[1]把小冰块3.81里的&quot;Claude描写改写&quot;、&quot;废话改写&quot;缝在&quot;友情平等&quot;后，翻译成英文&#10;[2]把潮汐预设里的&quot;高浓度爱意&quot;缝在&quot;xxx&quot;处，首尾都要改" style="${INPUT_CSS}height:240px;resize:vertical;font-family:monospace;font-size:11px;line-height:1.6">${escapeHtml(state.tutorialText || '')}</textarea>

      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button id="wi_ps_tut_cancel" style="${BTN_CSS}">取消</button>
        <button id="wi_ps_tut_run" style="${BTN_AI_CSS}padding:8px 24px;font-size:13px">🤖 解析并规划</button>
      </div>

      <div id="wi_ps_tut_status" style="margin-top:12px;font-size:12px;color:var(--wi-text-dim)"></div>
    `;

    $box.html(html);
    $mask.append($box);
    $('#' + PANEL_ID).append($mask);

    // （调试已删）
    const $status = $box.find('#wi_ps_tut_status');
    const $text = $box.find('#wi_ps_tut_text');

    function renderStatus(text, color) {
      $status.html(text).css('color', color || 'var(--wi-text-dim)');
    }

    const $tokenEst = $box.find('#wi_ps_tut_token_est');

    // ★ 计算并刷新 token 预估
    async function refreshTokenEstimate() {
      const checked = [];
      $box.find('.wi-ps-tut-src-check:checked').each(function () {
        checked.push({ name: $(this).val(), type: $(this).attr('data-srctype') || 'preset' });
      });
      state.tutorialSourceNames = checked.map(c => c.name);

      if (checked.length === 0) {
        $tokenEst.html('📊 未选源').css('color', 'var(--wi-text-dim)');
        return;
      }

      $tokenEst.html('📊 正在估算…').css('color', 'var(--wi-text-dim)');

      const isRetrieval = $box.find('input[name="wi_ps_tut_mode"]:checked').val() === 'retrieval';
      const tutorialText = $text.val() || '';
      const keywords = isRetrieval ? extractTutorialKeywords(tutorialText) : [];

      let totalTokens = 0;
      let totalEntries = 0;
      let rawEntries = 0;
      const details = [];

      for (const c of checked) {
        try {
          let entries = [];
          if (c.type === 'worldbook') {
            const arr = await getWorldbook(c.name);
            entries = (arr || []).map(e => ({ name: e.name, content: e.content || '' }));
          } else {
            const preset = readPreset(c.name);
            if (preset) {
              entries = extractOrderedEntries(preset).map(e => ({
                name: e.name,
                content: e.prompt.content || '',
              }));
            }
          }
          rawEntries += entries.length;

          let useEntries = entries;
          let note = '';
          if (isRetrieval) {
            const filtered = filterEntriesByKeywords(entries, c.name, tutorialText, keywords);
            useEntries = filtered.entries;
            if (filtered.matchedBy === 'sourceName') note = '（教程提到源名，全载）';
            else if (filtered.matchedBy === 'keyword') note = '（命中 ' + filtered.matchedKeywords.length + ' 个关键词）';
            else note = '（❌ 没命中）';
          }

          const t = estimateSourceTokens(useEntries);
          totalTokens += t;
          totalEntries += useEntries.length;
          details.push(c.name + '（' + useEntries.length + (isRetrieval ? '/' + entries.length : '') + ' 条，约 ' + t.toLocaleString() + '）' + note);
        } catch (e) {
          console.warn('[缝合器][教程] 估算失败:', c.name, e);
        }
      }

      const fixedOverhead = estimateTokens(tutorialText) + 8000;
      totalTokens += fixedOverhead;

      const limit = TUTORIAL_TOKEN_LIMIT;
      let color = 'var(--wi-ok)';
      let hint = '';

      // ★ 全量模式不提示 token（用户会自己测极限）；检索模式保留轻提示
      if (isRetrieval) {
        if (totalTokens >= limit.danger) {
          color = 'var(--wi-warn)';
          hint = ' ⚠️ 可能超限';
        } else if (totalTokens >= limit.warn) {
          color = 'var(--wi-warn)';
          hint = ' ⚠️ 接近上限';
        }
      }

      const modeLabel = isRetrieval ? '🔍 检索' : '全量';
      $tokenEst
        .html(
          `📊 [${modeLabel}] 已选 <b>${checked.length}</b> 个源`
          + (isRetrieval ? `（命中 <b>${totalEntries}</b> / 原始 ${rawEntries} 条）` : `（共 <b>${totalEntries}</b> 条）`)
          + `，预估 <b style="color:${color}">${totalTokens.toLocaleString()}</b> token${hint}`
          + (details.length <= 5 ? '<br><span style="color:var(--wi-text-faint);font-size:10px">' + details.join('｜') + '</span>' : '')
        )
        .css('color', color);
    }

    // 模式切换 → 刷新预估
    $box.find('input[name="wi_ps_tut_mode"]').on('change', function () {
      state.tutorialRetrievalMode = $(this).val() === 'retrieval';
      refreshTokenEstimate();
    });

    // 勾选变化时刷新
    $box.find('.wi-ps-tut-src-check').on('change', refreshTokenEstimate);
    // 教程文本变化时也刷新（因为教程本身也占 token）
    let __tutTextTimer = null;
    $box.find('#wi_ps_tut_text').on('input', () => {
      clearTimeout(__tutTextTimer);
      __tutTextTimer = setTimeout(refreshTokenEstimate, 500);
    });

    // 初始刷一次
    refreshTokenEstimate();

    $box.find('#wi_ps_tut_cancel').on('click', () => {
      state.tutorialText = $text.val() || '';
      $mask.remove();
    });

    $box.find('#wi_ps_tut_run').on('click', async () => {
      const text = ($text.val() || '').trim();
      state.tutorialText = text;
      const checked = [];
      $box.find('.wi-ps-tut-src-check:checked').each(function () {
        checked.push({ name: $(this).val(), type: $(this).attr('data-srctype') || 'preset' });
      });
      state.tutorialSourceNames = checked.map(c => c.name);

      if (!text) { renderStatus('❌ 教程内容为空', 'var(--wi-err)'); return; }
      if (checked.length === 0) { renderStatus('❌ 至少勾选一个源', 'var(--wi-err)'); return; }

      // ★ 收集源数据（预设 + 世界书），检索模式下过滤
      const isRetrieval = state.tutorialRetrievalMode;
      const keywords = isRetrieval ? extractTutorialKeywords(text) : [];
      console.log('[缝合器][教程] 模式:', isRetrieval ? '检索' : '全量', ' 关键词:', keywords);

      // ★ 检索模式：强制检测引号
      if (isRetrieval && keywords.length === 0) {
        const cont = confirm(
          '⚠️ 检索模式：你的教程里没有任何引号，脚本无法识别条目名，检索会全部落空。\n\n' +
          '建议：\n' +
          '· 点"取消"，给条目名加上引号（如 "Claude描写改写"）\n' +
          '· 或改用"全量"模式\n\n' +
          '仍要继续吗？（继续 = 大概率抓不到条目）'
        );
        if (!cont) {
          renderStatus('❌ 已取消。请给条目名加引号，或改用全量模式。', 'var(--wi-warn)');
          return;
        }
      }

      const sourceData = [];
      const retrievalStats = [];   // 记录检索命中情况

      for (const c of checked) {
        try {
          let allEntries = [];
          let type = c.type;

          if (c.type === 'worldbook') {
            const arr = await getWorldbook(c.name);
            if (!Array.isArray(arr)) {
              renderStatus('❌ 读取世界书「' + c.name + '」失败（返回不是数组）', 'var(--wi-err)');
              return;
            }
            allEntries = arr.map((e, i) => ({
              name: e.name || '(未命名)',
              content: e.content || '',
              identifier: 'wb_' + (e.uid !== undefined ? e.uid : i),
              enabled: e.enabled !== false,
            }));
          } else {
            const preset = readPreset(c.name);
            if (!preset) {
              renderStatus('❌ 读取源预设「' + c.name + '」失败', 'var(--wi-err)');
              return;
            }
            allEntries = extractOrderedEntries(preset).map(e => ({
              name: e.name,
              content: e.prompt.content || '',
              identifier: e.identifier,
              enabled: e.enabled !== false,
            }));
          }

          let useEntries = allEntries;
          if (isRetrieval) {
            const filtered = filterEntriesByKeywords(allEntries, c.name, text, keywords);
            useEntries = filtered.entries;
            retrievalStats.push({
              source: c.name,
              type: type,
              matchedBy: filtered.matchedBy,
              total: allEntries.length,
              used: useEntries.length,
              matchedKeywords: filtered.matchedKeywords,
            });
            if (useEntries.length === 0) {
              console.warn('[缝合器][教程] 检索模式：「' + c.name + '」没命中任何条目，跳过');
              continue;  // 没命中的源直接不加入
            }
          }

          sourceData.push({
            name: c.name,
            type: type,
            entries: useEntries,
          });
        } catch (e) {
          renderStatus('❌ 读取「' + c.name + '」出错：' + escapeHtml(e.message || String(e)), 'var(--wi-err)');
          return;
        }
      }

      if (sourceData.length === 0) {
        renderStatus('❌ 检索模式下没有任何源命中条目。请换关键词，或改用全量模式。', 'var(--wi-err)');
        return;
      }

      if (isRetrieval) {
        const statLines = retrievalStats.map(s =>
          '· ' + s.source + '：' + s.used + '/' + s.total + ' 条' +
          (s.matchedBy === 'sourceName' ? '（教程提到源名，全载）' :
            s.matchedBy === 'keyword' ? '（命中：' + s.matchedKeywords.join('、') + '）' :
              '（未命中）')
        ).join('\n');
        console.log('[缝合器][教程] 检索统计:\n' + statLines);
      }

      state.tutorialSourceData = sourceData;   // ★ 缓存，给 buildTutorialPlansFromAI 用

      $mask.remove();

      showLoadingMask(
        '🤖 AI 正在解析教程…',
        '涉及 ' + checked.length + ' 个源（预设 + 世界书）。可能需要 30~120 秒。请勿刷新页面。'
      );

      let result;
      try {
        result = await aiParseTutorial(text, sourceData);
      } finally {
        hideLoadingMask();
      }

      if (result.error) {
        alert('❌ 教程解析失败：' + result.error);
        if (result.raw) console.error('[缝合器][教程] 原始返回:', result.raw);
        return;
      }

      if (!result.plans || result.plans.length === 0) {
        alert('AI 没解析出任何条目');
        return;
      }

      const plans = buildTutorialPlansFromAI(result.plans, result.unmatched || []);
      if (plans.length === 0) {
        alert('没能构建任何有效的缝合计划，请查看 F12 日志');
        return;
      }

      showTutorialReviewTable(plans, state.sutureTargetStructure, result.unmatched || []);
    });
  }

  async function aiParseTutorial(tutorialText, sourcePresetData) {
    if (!isAiConfigReady()) return { plans: [], unmatched: [], error: '未配置 AI' };

    const structure = state.sutureTargetStructure;
    if (!structure) return { plans: [], unmatched: [], error: '目标预设结构未加载' };

    // 目标预设的 zone 描述
    const targetPreset = state.sutureTargetPreset;
    const targetEntries = extractOrderedEntries(targetPreset);
    const zoneEntriesMap = new Map();
    structure.zones.forEach(z => {
      const names = [];
      for (let i = z.startIdx; i <= z.endIdx && i < targetEntries.length; i++) {
        names.push(targetEntries[i].name);
      }
      zoneEntriesMap.set(z.name, names);
    });

    const cotZone = structure.zones.find(z => z.zoneType === 'cot');
    let ctxCotZone = '（未识别到 COT 区）';
    if (cotZone) {
      const enabled = [];
      for (let i = cotZone.startIdx; i <= cotZone.endIdx && i < targetEntries.length; i++) {
        const e = targetEntries[i];
        if (e && e.enabled !== false) enabled.push(e);
      }
      ctxCotZone = '【COT区】：' + cotZone.name + '\n**已启用条目列表**：\n' + enabled.map((e, i) => (i + 1) + '. ' + e.name).join('\n');
    }

    const ctxVarInit = structure.varInitEntry
      ? '【获取变量区】：' + structure.varInitEntry.name
      : '（未识别到获取变量区）';

    const zoneList = structure.zones.map(z => {
      const names = zoneEntriesMap.get(z.name) || [];
      const namesStr = names.slice(0, 40).map((n, i) => (z.startIdx + 1 + i) + '. ' + n).join('\n');
      return '### ' + z.name + '（共 ' + names.length + ' 条）\n' + namesStr + (names.length > 40 ? '\n...(还有 ' + (names.length - 40) + ' 条)' : '');
    }).join('\n\n');

    // 源清单（预设 + 世界书，名字 + 内容前 400 字）
    const sourceBlocks = sourcePresetData.map(sp => {
      const typeLabel = sp.type === 'worldbook' ? '源世界书' : '源预设';
      const entriesStr = sp.entries.map((e, i) => {
        const preview = (e.content || '').slice(0, 400).replace(/\n/g, ' ');
        return (i + 1) + '. 【' + e.name + '】' + (preview ? '\n   内容前 400 字：' + preview : '');
      }).join('\n');
      return '#### ' + typeLabel + '：「' + sp.name + '」（共 ' + sp.entries.length + ' 条）\n' + entriesStr;
    }).join('\n\n');

    const sysPrompt = `你是 SillyTavern 预设缝合助手（教程模式）。

用户给你一段**自然语言教程**，教程里描述了若干条缝合操作。每条操作通常包含：
- 从**哪个源预设**（比如 "小冰块3.81"）里找
- **哪些条目**（比如 "Claude描写改写、废话改写、防解释补充包"）
- **缝到哪里**（比如 "友情平等下"、"字数限制下方"）
- **特殊处理**（比如 "翻译成英文"、"首尾都要改"）

【教程涉及的所有源】（可能是预设，也可能是世界书，看标题前缀）

${sourceBlocks}

【目标预设结构】

${ctxVarInit}
${ctxCotZone}

【目标预设的分区】

⚠️ 填写 zone 时只填分区名本身，不要加任何后缀。

${zoneList}

【任务】

逐条解析教程里的指令（可能用 [1][2][3] 标号，也可能是自然段），为**每一条要缝的源条目**产出一个 plan。

对每条 plan：

1. **sourcePresetName**：源名（从上面勾选的源里挑，预设或世界书都可以，一字不差复制）
2. **sourceEntryName**：源条目名（必须跟上面源里的条目名一字不差）
3. **targetZone**：目标分区名（原样复制）
4. **targetInsertAfter**：
   - **必须**从上面"目标预设的分区"里那个 zone 的条目名列表里**挑一个**
   - 教程说"缝在友情平等下" → 你要在目标预设的 zone 成员里找"友情平等"这个条目
   - 找不到精确匹配 → 语义匹配（比如"友情平等"匹配到"🔔平等化"）
   - 实在找不到 → 填 "__LAST__"
   - ⚠️ **绝对不要**填"源条目名"（比如"Claude描写改写"），**那是你要缝进去的东西，不是目标位置**
5. **entryName**：缝合后的条目名（一般就是 sourceEntryName）
6. **wrapVar**：变量名（中文）
   - 源条目**已有 setvar** → null
   - 源条目**无变量** → 起一个有意义的中文变量名
7. **cotPlan**：
   - **如果源条目是 COT 类**（名字以 COT- 开头，或内容含 <thinking> / 思维链）→ {"type": "none"}
   - **否则** → {"type": "getvar", "getvarName": "和 wrapVar 一致", "getvarTargetCot": "从【COT区已启用条目列表】里挑一个最合适的"}
   - ⚠️ 任何带 setvar 的条目必须挂 getvar，否则内容读不到
8. **contentOverride**：
   - 如果教程要求**改写内容**（比如 "翻译成英文"、"改写成 xx 风格"），填**改写后的完整内容**
   - 否则填 null（脚本用源条目原文）
   - ⚠️ 只翻译/改写**教程明确提到的条目**，其他条目不要动
9. **contentPrefix** / **contentSuffix**：
   - 如果教程说 "首尾都要改"、"首尾加 xx"、"包裹" 之类，填**要加的标签**（比如 "<high_love>\n" 和 "\n</high_love>"）
   - 否则填 null
10. **reason**：一句话理由（引用教程原文）

【unmatched 记录】

如果教程提到某个条目，但：
- **源预设里找不到**（名字对不上，也没有语义匹配）
- **目标位置找不到**（zone 名对不上，且无法兜底）

就把它记进 **unmatched** 数组，字段：
- **tutorialLine**：教程原文
- **reason**：为什么没匹配上

【输出格式】

只返回 JSON：

{
  "plans": [
    {
      "sourcePresetName": "小冰块3.81",
      "sourceEntryName": "Claude描写改写",
      "targetZone": "文风主规则",
      "targetInsertAfter": "🔔平等化",
      "entryName": "Claude描写改写",
      "wrapVar": "claude描写改写",
      "cotPlan": { "type": "getvar", "getvarName": "claude描写改写", "getvarTargetCot": "📍常规创作思维" },
      "contentOverride": null,
      "contentPrefix": null,
      "contentSuffix": null,
      "reason": "教程 [1] 要求把小冰块的 Claude 描写改写缝在友情平等下"
    }
  ],
  "unmatched": [
    {
      "tutorialLine": "[3]把爱神里的不要到处扣扣缝在 p11",
      "reason": "源预设「爱神」里找不到条目「不要到处扣扣」"
    }
  ]
}

⚠️ 内容里如果有换行，用 \\n 表示（JSON 标准转义）。`;

    const userPrompt = '【教程原文】\n\n' + tutorialText + '\n\n请解析并按 JSON 格式返回。';

    try {
      console.log('[缝合器][教程] ===== 发起解析请求 =====');
      console.log('[缝合器][教程] 教程长度:', tutorialText.length, ' 源预设数:', sourcePresetData.length);
      const content = await callAuxApi(
        [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, max_tokens: 60000 }
      );
      console.log('[缝合器][教程] ===== 返回 =====');
      console.log('[缝合器][教程原始返回]', content);

      const parsed = extractJsonFromAI(content);
      if (parsed && Array.isArray(parsed.plans)) {
        return { plans: parsed.plans, unmatched: parsed.unmatched || [], raw: content, error: null };
      }
      return { plans: [], unmatched: [], raw: content, error: 'AI 返回格式无法解析' };
    } catch (e) {
      return { plans: [], unmatched: [], raw: '', error: '请求失败：' + (e.message || e) };
    }
  }

  function buildTutorialPlansFromAI(aiPlans, aiUnmatched) {
    const structure = state.sutureTargetStructure;
    const plans = [];
    const allTargetEntries = extractOrderedEntries(state.sutureTargetPreset);

    // ★ 从缓存里建立源 -> 条目 的映射（预设 + 世界书都在这，上一步存好的）
    const sourcePresetMap = new Map();
    for (const sp of (state.tutorialSourceData || [])) {
      sourcePresetMap.set(sp.name, sp.entries.map(e => ({
        identifier: e.identifier,
        name: e.name,
        enabled: e.enabled !== false,
        prompt: { content: e.content || '', name: e.name },
        _fromWorldbook: sp.type === 'worldbook',
      })));
    }

    const extraUnmatched = [];

    aiPlans.forEach((ap, i) => {
      // 找源条目
      const srcEntries = sourcePresetMap.get(ap.sourcePresetName);
      if (!srcEntries) {
        extraUnmatched.push({
          tutorialLine: '[' + (i + 1) + '] 源预设「' + ap.sourcePresetName + '」未勾选',
          reason: '请重新勾选该预设',
        });
        return;
      }
      let srcEntry = srcEntries.find(e => e.name === ap.sourceEntryName);
      if (!srcEntry) {
        // 模糊匹配
        const lower = String(ap.sourceEntryName || '').toLowerCase();
        srcEntry = srcEntries.find(e => (e.name || '').toLowerCase().includes(lower) || lower.includes((e.name || '').toLowerCase()));
      }
      if (!srcEntry) {
        extraUnmatched.push({
          tutorialLine: '[' + (i + 1) + '] 源条目「' + ap.sourceEntryName + '」',
          reason: '在源预设「' + ap.sourcePresetName + '」里找不到',
        });
        return;
      }

      // 找目标 zone
      const zoneName = String(ap.targetZone || '').trim();
      let zoneObj = structure.zones.find(z => z.name === zoneName);
      if (!zoneObj && zoneName) {
        const cleaned = zoneName.replace(/\s*[【\[（(].+?[】\]）)]\s*$/, '').trim();
        zoneObj = structure.zones.find(z => z.name === cleaned);
      }
      if (!zoneObj) {
        extraUnmatched.push({
          tutorialLine: '[' + (i + 1) + '] 目标分区「' + zoneName + '」',
          reason: '目标预设里没有这个 zone',
        });
        return;
      }

      // 找目标插入位置
      let insertAfterFinal = ap.targetInsertAfter || '__LAST__';
      const zoneEntries = [];
      for (let k = zoneObj.startIdx; k <= zoneObj.endIdx && k < allTargetEntries.length; k++) {
        if (allTargetEntries[k]) zoneEntries.push(allTargetEntries[k]);
      }
      if (insertAfterFinal !== '__LAST__' && insertAfterFinal !== '__FIRST__') {
        const exact = zoneEntries.find(e => e.name === insertAfterFinal);
        if (!exact) {
          const lower = String(insertAfterFinal).toLowerCase();
          const fuzzy = zoneEntries.find(e => (e.name || '').toLowerCase().includes(lower) || lower.includes((e.name || '').toLowerCase()));
          if (fuzzy) {
            console.log('[缝合器][教程] 位置「' + insertAfterFinal + '」模糊匹配到「' + fuzzy.name + '」');
            insertAfterFinal = fuzzy.name;
          } else {
            // ★ 检查：这个位置名是不是"本批 plans 里某个条目的名字"（链式插入）
            const isChainRef = aiPlans.some(other => {
              if (other === ap) return false;
              const nm = other.entryName || other.sourceEntryName || '';
              return nm === insertAfterFinal || (nm && nm.includes(insertAfterFinal)) || (insertAfterFinal && insertAfterFinal.includes(nm));
            });
            if (isChainRef) {
              console.log('[缝合器][教程] 位置「' + insertAfterFinal + '」是"本批其他条目"的名字（链式插入），保留不兜底');
              // 保留 insertAfterFinal 原样，让 executeAiSuture 里的链式逻辑处理
            } else {
              console.warn('[缝合器][教程] 位置「' + insertAfterFinal + '」在 zone「' + zoneObj.name + '」里找不到，兜底到 __LAST__');
              extraUnmatched.push({
                tutorialLine: '[' + (i + 1) + '] 「' + srcEntry.name + '」的目标位置「' + ap.targetInsertAfter + '」',
                reason: 'zone「' + zoneObj.name + '」里找不到这个位置，已放到 zone 末尾',
              });
              insertAfterFinal = '__LAST__';
            }
          }
        }
      }

      // 组合最终内容：override > (prefix + 原文 + suffix)
      const originalContent = srcEntry.prompt.content || '';
      let finalContent;
      if (ap.contentOverride !== null && ap.contentOverride !== undefined) {
        finalContent = String(ap.contentOverride);
      } else {
        finalContent = originalContent;
      }
      if (ap.contentPrefix) finalContent = String(ap.contentPrefix) + finalContent;
      if (ap.contentSuffix) finalContent = finalContent + String(ap.contentSuffix);

      // cotPlan 校验
      let cotPlan = ap.cotPlan || { type: 'none' };

      // 判断这条是不是 COT 条目
      const nameLooksCot = /^COT[-\s]/i.test(srcEntry.name) || /思维链|thinking/i.test(srcEntry.name);
      const contentLooksCot = /<thinking>|<\/thinking>|\bCoT\b|思维链/i.test(originalContent);
      const isCot = nameLooksCot || contentLooksCot;
      if (isCot) cotPlan = { type: 'none' };

      plans.push({
        sourceId: 'tut_' + (ap.sourcePresetName || '_') + '_' + (srcEntry.identifier || i),
        sourceIndex: i + 1,
        sourceName: srcEntry.name,
        sourceContent: finalContent,   // ★ 用最终内容
        _sutureFrom: ap.sourcePresetName || '教程缝合',   // ★ 教程缝合的来源标记
        zone: zoneObj.name,
        zoneObj: zoneObj,
        insertAfter: insertAfterFinal,
        entryName: ap.entryName || srcEntry.name,
        wrapVar: ap.wrapVar || null,
        cotPlan: cotPlan,
        reason: ap.reason || '',
        _isTutorial: true,
        _isCot: isCot,
        _tutorialSourcePreset: ap.sourcePresetName,
      });
    });

    // 保存到 state，供写入后提示
    state.tutorialUnmatched = (aiUnmatched || []).concat(extraUnmatched);

    return plans;
  }

  function showTutorialReviewTable(plans, structure, unmatched) {
    let html = '<div style="font-size:14px;font-weight:700;color:var(--wi-accent-2);margin-bottom:10px">📖 教程缝合方案（' + plans.length + ' 条）</div>';
    html += '<div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:10px">审阅下面的方案。确认后执行写入。</div>';

    if (unmatched && unmatched.length > 0) {
      html += '<div style="background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:10px;margin-bottom:12px;font-size:11px;color:var(--wi-warn);line-height:1.7">';
      html += '<b>⚠️ 教程里有 ' + unmatched.length + ' 条无法匹配（不会写入）：</b><br>';
      unmatched.forEach(u => {
        html += '· ' + escapeHtml(u.tutorialLine || '') + ' — ' + escapeHtml(u.reason || '') + '<br>';
      });
      html += '</div>';
    }

    html += '<div style="max-height:560px;overflow-y:auto;border:1px solid var(--wi-border-soft);border-radius:6px">';
    plans.forEach((r, i) => {
      const isCot = !!r._isCot;
      const zoneOk = !!r.zoneObj;
      html += `
        <div class="wi-ps-tut-review-row" data-idx="${i}" style="padding:10px;border-bottom:1px solid var(--wi-border-soft)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:11px;color:var(--wi-accent-2)">#${i + 1}</span>
            ${isCot ? '<span style="font-size:10px;color:var(--wi-accent);background:var(--wi-bg-2);padding:1px 5px;border-radius:3px">COT</span>' : ''}
            <span style="font-size:10px;color:var(--wi-text-dim);background:var(--wi-bg-1);padding:1px 6px;border-radius:3px">来自：${escapeHtml(r._tutorialSourcePreset || '?')}</span>
            <span style="font-size:12px;color:var(--wi-text);font-weight:600">${escapeHtml(r.sourceName)}</span>
            <span style="color:var(--wi-text-faint);font-size:10px">→ ${escapeHtml(r.entryName)}</span>
          </div>
          <div style="font-size:11px;color:var(--wi-text-dim);line-height:1.7;margin-bottom:6px">
            <b style="color:var(--wi-ok)">zone：</b>${escapeHtml(r.zone)}${zoneOk ? '' : ' <span style="color:var(--wi-err)">（⚠️ 不在 zone 列表）</span>'}
            &nbsp;·&nbsp;<b style="color:var(--wi-ok)">插到：</b>${escapeHtml(r.insertAfter === '__LAST__' ? '（区末尾）' : r.insertAfter === '__FIRST__' ? '（区开头）' : r.insertAfter)}
            ${r.wrapVar ? '&nbsp;·&nbsp;<b style="color:var(--wi-ok)">变量名：</b>' + escapeHtml(r.wrapVar) : ''}
            ${r.cotPlan.type === 'getvar' ? '&nbsp;·&nbsp;<b style="color:var(--wi-accent-2)">getvar →</b> ' + escapeHtml(r.cotPlan.getvarTargetCot || '（自动兜底）') : ''}
          </div>
          <div style="font-size:10px;color:var(--wi-text-dim);margin-bottom:6px">理由：${escapeHtml(r.reason)}</div>
          <details style="margin-bottom:6px">
            <summary style="cursor:pointer;font-size:10px;color:var(--wi-text-faint)">查看内容（前 500 字）</summary>
            <textarea readonly style="width:100%;height:100px;background:var(--wi-bg-0);color:var(--wi-text-dim);border:1px solid var(--wi-border-soft);border-radius:4px;padding:6px;box-sizing:border-box;font-family:monospace;font-size:10px;margin-top:4px">${escapeHtml(String(r.sourceContent || '').slice(0, 500), 999999)}</textarea>
          </details>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="wi-ps-tut-review-edit" data-idx="${i}" style="${BTN_CSS}padding:3px 10px;font-size:11px">✏️ 编辑</button>
            <button class="wi-ps-tut-review-skip" data-idx="${i}" style="${BTN_CSS}padding:3px 10px;font-size:11px">跳过这条</button>
          </div>
        </div>
      `;
    });
    html += '</div>';

    html += `
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button id="wi_ps_tut_review_cancel" style="${BTN_CSS}">取消</button>
        <button id="wi_ps_tut_review_execute" style="${BTN_PRIMARY_CSS}padding:8px 24px;font-size:13px">✅ 全部确认并写入</button>
      </div>
    `;

    showModal(html, ($m) => {
      $m.find('#wi_ps_tut_review_cancel').on('click', () => $m.closest('#wi_ps_modal_mask').remove());

      $m.find('#wi_ps_tut_review_execute').on('click', async () => {
        $m.closest('#wi_ps_modal_mask').remove();
        await executeAiSuture(plans, structure);
      });

      $m.find('.wi-ps-tut-review-skip').on('click', function () {
        const idx = parseInt($(this).data('idx'), 10);
        plans[idx]._skipped = true;
        $(this).closest('.wi-ps-tut-review-row').css('opacity', 0.4);
        $(this).prop('disabled', true).text('已跳过');
      });

      $m.find('.wi-ps-tut-review-edit').on('click', function () {
        const idx = parseInt($(this).data('idx'), 10);
        editSuturePlanRow(plans[idx], structure, () => {
          $m.closest('#wi_ps_modal_mask').remove();
          showTutorialReviewTable(plans.filter(x => !x._skipped), structure, unmatched);
        });
      });
    });
  }

  function renderSutureBody() {
    if (!state.sutureSourcePreset) {
      $('#wi_ps_suture_body').html('<div style="color:var(--wi-text-dim);text-align:center;padding:40px;font-size:12px">正在加载源预设…</div>');
      return;
    }

    const srcEntries = extractOrderedEntries(state.sutureSourcePreset);

    const tgtOccupiedVars = new Set();
    if (state.sutureTargetPreset) {
      getNormalizedPrompts(state.sutureTargetPreset).forEach(p => {
        if (!p || typeof p !== 'object') return;
        parseSetVars(p.content || '').forEach(sv => tgtOccupiedVars.add(sv.name));
      });
    }

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:13px;color:var(--wi-text);font-weight:600">
          源预设条目：<b style="color:var(--wi-accent)">${escapeHtml(state.sutureSource || '')}</b>
          <span style="color:var(--wi-text-dim);font-weight:400">（${srcEntries.length} 条）</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input id="wi_ps_suture_search" placeholder="🔍 搜索条目名" style="${INPUT_CSS}width:180px" value="${escapeHtml(state.sutureSearch || '')}">
          <button id="wi_ps_suture_checkall" style="${BTN_CSS}font-size:11px">全选</button>
          <button id="wi_ps_suture_uncheckall" style="${BTN_CSS}font-size:11px">全不选</button>
          <button id="wi_ps_suture_reset_pick" style="${BTN_CSS}font-size:11px">清空</button>
        </div>
      </div>
      <div id="wi_ps_suture_list" style="max-height:420px;overflow-y:auto;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px;padding:6px">
    `;

    // ★ 搜索过滤：渲染全部，靠显隐控制（避免 IME 打断）
    const searchTerm = (state.sutureSearch || '').trim().toLowerCase();

    srcEntries.forEach(e => {
      const p = e.prompt;
      const pick = state.suturePick[e.identifier] || {};
      const checked = !!pick.checked;

      const setVars = parseSetVars(p.content || '');
      const assignments = setVars.filter(sv => isAssignmentSetVar(sv));

      const series = new Set();
      const conflicts = [];
      for (const sv of assignments) {
        const numbered = parseNumberedVarName(sv.name);
        const baseName = numbered ? numbered.prefix : sv.name;
        series.add(baseName);
        if (tgtOccupiedVars.has(sv.name)) {
          const newName = findShiftedVarName(sv.name, tgtOccupiedVars);
          conflicts.push({ from: sv.name, to: newName });
        }
      }

      const isPlainText = setVars.length === 0;

      const searchName = (p.name || '').toLowerCase();
      const hiddenBySearch = searchTerm && !searchName.includes(searchTerm);
      html += `
        <div class="wi-ps-suture-item" data-id="${escapeHtml(e.identifier)}" data-searchname="${escapeHtml(searchName)}" style="padding:10px;border-bottom:1px solid var(--wi-border-soft);background:${checked ? 'var(--wi-bg-3)' : 'transparent'};border-radius:4px;margin-bottom:2px;display:${hiddenBySearch ? 'none' : 'block'}">
          <div style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" class="wi-ps-suture-item-check" data-id="${escapeHtml(e.identifier)}" ${checked ? 'checked' : ''} style="cursor:pointer;flex-shrink:0">
            <span style="flex-shrink:0;width:8px;height:8px;border-radius:50%;background:${e.enabled ? 'var(--wi-ok)' : 'var(--wi-text-faint)'}"></span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;color:${e.enabled ? 'var(--wi-text)' : 'var(--wi-text-dim)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${escapeHtml(p.name || '(无名称)')}
              </div>
              <div style="font-size:10px;color:var(--wi-text-dim);margin-top:3px;line-height:1.6">
                ${series.size > 0 ? `📁 ${Array.from(series).map(s => `<code class="wi-code">${escapeHtml(s)}</code>`).join(' ')}` : ''}
                ${conflicts.length > 0 ? `<br>⚠️ ${conflicts.map(c => `<code class="wi-code-warn">${escapeHtml(c.from)}→${escapeHtml(c.to)}</code>`).join(' ')}` : ''}
                ${isPlainText ? '<span style="color:var(--wi-warn)">⚠️ 无变量</span>' : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;

    html += `
      <div style="margin-top:14px;background:var(--wi-bg-0);border:1px solid var(--wi-border-soft);border-radius:6px;padding:12px">
        <div style="font-size:12px;color:var(--wi-text);font-weight:600;margin-bottom:8px">缝合选项</div>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--wi-accent-2);cursor:pointer">
            <input type="checkbox" id="wi_ps_opt_learn_cot" ${state.sutureLearnCot ? 'checked' : ''}>
            <span>🤖 AI 优化 COT 插入位置
            <span style="display:block;font-size:10px;color:var(--wi-text-dim);margin-top:2px;margin-left:14px">└ 开：AI 读完整 COT，把 getvar 插到合适处｜关：直接追加末尾</span>
            </span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--wi-text);cursor:pointer">
            <input type="checkbox" id="wi_ps_opt_name_suffix" ${state.sutureNameSuffix ? 'checked' : ''}>
            <span>🏷️ 条目名加 [来自xxx] 后缀
            <span style="display:block;font-size:10px;color:var(--wi-text-dim);margin-top:2px;margin-left:14px">└ 开：名字带来源，肉眼好认｜关：名字干净，来源只存 extensions</span>
            </span>
          </label>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <button id="wi_ps_suture_ai_plan" style="${BTN_AI_CSS}padding:8px 24px;font-size:13px">🤖 AI 缝合</button>
        </div>
        <div id="wi_ps_suture_status" style="margin-top:12px;font-size:12px;color:var(--wi-text-dim)"></div>
      </div>
    `;

    $('#wi_ps_suture_body').html(html);

    $('.wi-ps-suture-item-check').on('change', function () {
      const id = String($(this).attr('data-id') || '');
      if (!id) return;
      if (!state.suturePick[id]) state.suturePick[id] = {};
      state.suturePick[id].checked = $(this).is(':checked');
      const $item = $(this).closest('.wi-ps-suture-item');
      $item.css('background', $(this).is(':checked') ? 'var(--wi-bg-3)' : 'transparent');
      updateSutureStatus();
    });

    $('#wi_ps_suture_checkall').on('click', () => {
      $('.wi-ps-suture-item-check').each(function () {
        $(this).prop('checked', true).trigger('change');
      });
    });
    // 注意：现在"全选"只选当前显示的（过滤后的）条目，
    // 因为 .wi-ps-suture-item-check 只在 DOM 里出现过滤后的条目
    $('#wi_ps_suture_uncheckall').on('click', () => {
      $('.wi-ps-suture-item-check').each(function () {
        $(this).prop('checked', false).trigger('change');
      });
    });
    $('#wi_ps_suture_reset_pick').on('click', () => {
      state.suturePick = {};
      renderSutureBody();
    });

    // ★ 搜索框：只过滤显隐，不重渲染（避免中文输入法被打断）
    $('#wi_ps_suture_search').off('input.wiSearch').on('input.wiSearch', function () {
      state.sutureSearch = $(this).val() || '';
      const term = String(state.sutureSearch).trim().toLowerCase();
      $('#wi_ps_suture_list .wi-ps-suture-item').each(function () {
        const nm = String($(this).attr('data-searchname') || '');
        $(this).css('display', (!term || nm.includes(term)) ? 'block' : 'none');
      });
    });

    $('#wi_ps_suture_ai_plan').on('click', doAiSuture);

    $('#wi_ps_opt_learn_cot').on('change', function () {
      state.sutureLearnCot = $(this).is(':checked');
    });
    $('#wi_ps_opt_name_suffix').on('change', function () {
      state.sutureNameSuffix = $(this).is(':checked');
    });
    updateSutureStatus();
  }

  async function doAiSuture() {
    console.log('[缝合器][缝合流程] ===== 开始 AI 缝合 =====');
    if (!isAiConfigReady()) { alert('未配置 AI'); return; }
    if (!state.sutureSourcePreset || !state.sutureTargetPreset) { alert('请先选源和目标'); return; }
    // ★ 只有"预设→预设"才需要查重名；世界书当源时名字空间不同，允许同名
    if (state.sutureSourceType === 'preset' && state.sutureSource === state.sutureTarget) {
      alert('源和目标不能相同');
      return;
    }
    if (!state.sutureTargetStructure) { alert('目标预设结构未加载'); return; }

    const picked = Object.entries(state.suturePick).filter(([_, v]) => v.checked);
    console.log('[缝合器][缝合流程] 已勾选条数:', picked.length);
    if (picked.length === 0) { alert('未勾选任何条目'); return; }

    const structure = state.sutureTargetStructure;
    console.log('[缝合器][缝合流程] structure.varInitEntry:', structure.varInitEntry);
    console.log('[缝合器][缝合流程] structure.zones:', structure.zones.map(z => z.name));

    const hasAIZones = structure.detectedBy === 'ai-structure';
    const hasCotZone = structure.zones.some(z => z.zoneType === 'cot');
    if (!hasAIZones) {
      if (!confirm('还没用 AI 分析过目标预设结构。\nAI 缝合需要结构信息。\n\n要现在分析吗？')) return;
      const entries = extractOrderedEntries(state.sutureTargetPreset);
      const names = entries.map(e => e.name || '(无名称)');
      $('#wi_ps_suture_status').text('🤖 正在分析目标结构…').css('color', 'var(--wi-accent)');
      const r = await aiAnalyzeStructure(names);
      if (r.error) { alert('结构分析失败：' + r.error); return; }
      // ★ 补 startId/endId
      const targetEntries = extractOrderedEntries(state.sutureTargetPreset);
      r.zones.forEach(z => {
        z.startId = targetEntries[z.startIdx]?.identifier || '';
        z.endId = targetEntries[z.endIdx]?.identifier || '';
      });
      structure.zones = r.zones;
      structure.detectedBy = 'ai-structure';
      await saveZonesToPreset(r.zones);
      renderStructurePanel(structure);
    }
    if (!hasCotZone && !structure.zones.some(z => z.zoneType === 'cot')) {
      if (!confirm('未识别到 COT 区。\nCOT 相关条目可能无法正确放置。\n\n继续吗？')) return;
    }

    const srcEntries = extractOrderedEntries(state.sutureSourcePreset);
    const items = [];
    for (const [id] of picked) {
      const e = srcEntries.find(x => x.identifier === id);
      if (e) items.push({ sourceId: id, sourceName: e.name, sourceContent: e.prompt.content || '' });
    }

    console.log('[缝合器][缝合流程] 待规划 items:', items.map(i => ({ id: i.sourceId, name: i.sourceName })));

    // ★ 检测分组
    const groups = detectSourceGroups(items);
    if (groups.length > 0) {
      console.log('[缝合器][缝合流程] 检测到分组:', groups.map(g => ({
        range: `${g.startIdx + 1}~${g.endIdx + 1}`,
        leader: items[g.leaderIdx].sourceName,
        members: items.slice(g.startIdx, g.endIdx + 1).map(x => x.sourceName),
      })));
    }
    state.sutureSourceGroups = groups;   // 存起来，拍板表格要用

    const BATCH = 10;
    const batches = [];
    for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
    console.log('[缝合器][缝合流程] 分批数:', batches.length);

    const allResults = [];
    for (let bi = 0; bi < batches.length; bi++) {
      $('#wi_ps_suture_status').text(`🤖 AI 规划中（第 ${bi + 1}/${batches.length} 批，${batches[bi].length} 条）…`).css('color', 'var(--wi-accent)');
      console.log(`[缝合器][缝合流程] 第 ${bi + 1}/${batches.length} 批，${batches[bi].length} 条`);

      showLoadingMask(
        `🤖 AI 正在规划缝合方案…`,
        `第 ${bi + 1}/${batches.length} 批，本批 ${batches[bi].length} 条。请勿刷新页面。`
      );

      let r;
      try {
        r = await aiPlanSutureBatch(batches[bi], structure, state.sutureTargetPreset);
      } finally {
        hideLoadingMask();
      }

      if (r.error) {
        console.error(`[缝合器][缝合流程] 第 ${bi + 1} 批失败:`, r.error);
        const retry = await showBatchErrorDialog(bi + 1, batches.length, r.error, allResults.length);
        if (retry === 'retry') { bi--; continue; }
        else if (retry === 'skip') { continue; }
        else if (retry === 'stop') { break; }
        else { return; }
      }

      console.log(`[缝合器][缝合流程] 第 ${bi + 1} 批成功，拿到 ${r.results.length} 条方案`);
      allResults.push(...r.results);

      if (bi < batches.length - 1) {
        const cont = await showBatchContinueDialog(bi + 1, batches.length, batches[bi].length, allResults.length);
        if (cont === 'stop') break;
        if (cont === 'cancel') return;
      }
    }

    $('#wi_ps_suture_status').text('').css('color', 'var(--wi-text-dim)');

    if (allResults.length === 0) {
      alert('没有任何成功的批次');
      return;
    }

    console.log('[缝合器][缝合流程] 全部方案汇总:', allResults);
    showSutureReviewTable(allResults, structure, items);
  }

  function showBatchContinueDialog(doneBatch, totalBatch, batchSize, totalGot) {
    return new Promise((resolve) => {
      const MASK_ID = 'wi_ps_batch_continue_mask';
      __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

      const $mask = $('<div id="' + MASK_ID + '">').css({
        position: 'fixed', inset: 0, background: 'var(--wi-mask)', zIndex: 1000030,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      });
      const $box = $('<div>').addClass('wi-ps-mobile-box').css({
        background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '8px',
        padding: '18px', width: '460px', maxWidth: '92vw', color: 'var(--wi-text)',
        boxShadow: 'var(--SmartThemeShadowColor, 0 8px 32px rgba(0,0,0,.6))',
      }).html(`
        <div style="font-size:14px;font-weight:700;color:var(--wi-ok);margin-bottom:10px">✅ 第 ${doneBatch}/${totalBatch} 批完成</div>
        <div style="font-size:12px;color:var(--wi-text);line-height:1.8;margin-bottom:14px">
          本批 ${batchSize} 条已拿到 AI 方案<br>
          累计已成功 <b style="color:var(--wi-accent)">${totalGot}</b> 条<br>
          <br>
          <span style="color:var(--wi-text-dim)">为避免 API 并发/频率限制，建议等一会儿再继续。</span>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button id="wi_ps_batch_cancel" style="${BTN_CSS}">取消（丢弃全部）</button>
          <button id="wi_ps_batch_stop" style="${BTN_CSS}">停止（用已拿到的 ${totalGot} 条）</button>
          <button id="wi_ps_batch_continue" style="${BTN_PRIMARY_CSS}padding:8px 20px">继续下一批</button>
        </div>
      `);
      $mask.append($box);
      $('#' + PANEL_ID).append($mask);

      $mask.on('click', (e) => { if (e.target === $mask[0]) e.stopPropagation(); });

      $box.find('#wi_ps_batch_cancel').on('click', () => { $mask.remove(); resolve('cancel'); });
      $box.find('#wi_ps_batch_stop').on('click', () => { $mask.remove(); resolve('stop'); });
      $box.find('#wi_ps_batch_continue').on('click', () => { $mask.remove(); resolve('continue'); });
    });
  }

  function showBatchErrorDialog(batchNum, totalBatch, errorMsg, totalGot) {
    return new Promise((resolve) => {
      const MASK_ID = 'wi_ps_batch_error_mask';
      __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

      const $mask = $('<div id="' + MASK_ID + '">').css({
        position: 'fixed', inset: 0, background: 'var(--wi-mask)', zIndex: 1000030,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      });
      const $box = $('<div>').addClass('wi-ps-mobile-box').css({
        background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '8px',
        padding: '18px', width: '500px', maxWidth: '92vw', color: 'var(--wi-text)',
        boxShadow: 'var(--SmartThemeShadowColor, 0 8px 32px rgba(0,0,0,.6))',
      }).html(`
        <div style="font-size:14px;font-weight:700;color:var(--wi-err);margin-bottom:10px">❌ 第 ${batchNum}/${totalBatch} 批失败</div>
        <div style="font-size:12px;color:var(--wi-text);line-height:1.8;margin-bottom:10px">
          <div style="color:var(--wi-err);word-break:break-all">${escapeHtml(errorMsg)}</div>
          <div style="margin-top:8px;color:var(--wi-text-dim)">累计已成功 ${totalGot} 条</div>
        </div>
        <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:12px;line-height:1.6">
          💡 常见的失败原因：API 并发/频率限制、网络超时、余额不足。<br>
          建议：等 1 分钟再点"重试"。
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button id="wi_ps_err_cancel" style="${BTN_CSS}">取消（丢弃全部）</button>
          <button id="wi_ps_err_stop" style="${BTN_CSS}">停止（用已拿到的 ${totalGot} 条）</button>
          <button id="wi_ps_err_skip" style="${BTN_CSS}">跳过这批</button>
          <button id="wi_ps_err_retry" style="${BTN_PRIMARY_CSS}padding:8px 20px">重试这批</button>
        </div>
      `);
      $mask.append($box);
      $('#' + PANEL_ID).append($mask);

      $mask.on('click', (e) => { if (e.target === $mask[0]) e.stopPropagation(); });

      $box.find('#wi_ps_err_cancel').on('click', () => { $mask.remove(); resolve('cancel'); });
      $box.find('#wi_ps_err_stop').on('click', () => { $mask.remove(); resolve('stop'); });
      $box.find('#wi_ps_err_skip').on('click', () => { $mask.remove(); resolve('skip'); });
      $box.find('#wi_ps_err_retry').on('click', () => { $mask.remove(); resolve('retry'); });
    });
  }

  function showSutureReviewTable(results, structure, items) {
    const srcMap = new Map();
    items.forEach(it => srcMap.set(it.sourceId, it));

    const normalized = results.map((r, i) => {
      const src = srcMap.get(r.sourceId) || items[i] || {};
      // ★ zone 匹配兜底：精确匹配 → 去后缀 → 前缀匹配
      let zone = structure.zones.find(z => z.name === r.zone);
      if (!zone && r.zone) {
        const cleaned = String(r.zone).replace(/\s*[【\[（(].+?[】\]）)]\s*$/, '').trim();
        zone = structure.zones.find(z => z.name === cleaned);
        if (zone) console.log(`[缝合器][拍板] zone「${r.zone}」兜底匹配到「${zone.name}」`);
      }
      if (!zone && r.zone) {
        zone = structure.zones.find(z => String(r.zone).startsWith(z.name) || z.name.startsWith(String(r.zone).trim()));
        if (zone) console.log(`[缝合器][拍板] zone「${r.zone}」前缀匹配到「${zone.name}」`);
      }

      // ★ 自动判定：这条是不是 COT 条目
      const entryNameFinal = r.entryName || src.sourceName || '新条目';
      const zoneIsCot = zone && zone.zoneType === 'cot';
      const nameLooksCot = /^COT[-\s]/i.test(entryNameFinal) || /\bCOT\b|思维链|thinking/i.test(entryNameFinal);
      const srcContent = src.sourceContent || '';
      const contentLooksCot = /<thinking>|<\/thinking>|\bCoT\b|思维链/i.test(srcContent);
      const isCotAuto = zoneIsCot && (nameLooksCot || contentLooksCot);

      return {
        sourceId: r.sourceId,
        sourceIndex: r.sourceIndex ?? (i + 1),
        sourceName: src.sourceName || '(未知)',
        sourceContent: srcContent,
        zone: r.zone || '',
        zoneObj: zone || null,
        insertAfter: r.insertAfter || '__LAST__',
        entryName: entryNameFinal,
        wrapVar: r.wrapVar || null,
        cotPlan: r.cotPlan || { type: 'none' },
        reason: r.reason || '',
        // ★ 自动判定
        _isCot: isCotAuto,
      };
    });

    // ★ 名字保持干净，来源信息存到 plan 的 _sutureFrom 字段
    if (state.sutureSource) {
      normalized.forEach(r => {
        if (!r._sutureFrom) {
          r._sutureFrom = state.sutureSource;
        }
      });
    }

    // ★ 自检条目：提前判定，显示实际插入位置
    let __cotZoneForPreview = null;
    let __zoneAfterCotForPreview = null;
    for (let i = 0; i < structure.zones.length; i++) {
      if (structure.zones[i].zoneType === 'cot') {
        __cotZoneForPreview = structure.zones[i];
        __zoneAfterCotForPreview = structure.zones[i + 1] || null;
        break;
      }
    }
    normalized.forEach(r => {
      r._isSelfCheck = isSelfCheckEntry(r.sourceContent, r.entryName);
      if (r._isSelfCheck) {
        if (__zoneAfterCotForPreview) {
          r._selfCheckTarget = __zoneAfterCotForPreview.name + '（开头）';
        } else if (__cotZoneForPreview) {
          r._selfCheckTarget = __cotZoneForPreview.name + '（末尾）';
        } else {
          r._selfCheckTarget = '（无 COT 区，保持原位）';
        }
      }
    });

    // ★ 分组展开：组内所有成员对齐到组首位置（链式）
    const srcGroups = state.sutureSourceGroups || [];
    if (srcGroups.length > 0) {
      const allSrcEntries = extractOrderedEntries(state.sutureSourcePreset);
      const globalItems = [];
      for (const [id] of Object.entries(state.suturePick).filter(([_, v]) => v.checked)) {
        const e = allSrcEntries.find(x => x.identifier === id);
        if (e) globalItems.push({ sourceId: id, sourceName: e.name });
      }
      const globalIdxMap = new Map();
      globalItems.forEach((g, i) => globalIdxMap.set(g.sourceId, i));

      // normalized 按 sourceIndex 排
      const byGlobalIdx = new Map();  // globalIdx -> normalized item
      normalized.forEach(r => {
        const gi = globalIdxMap.get(r.sourceId);
        if (gi !== undefined) byGlobalIdx.set(gi, r);
      });

      srcGroups.forEach((g, gIdx) => {
        const leader = byGlobalIdx.get(g.leaderIdx);
        if (!leader) return;
        const leaderZone = leader.zone;
        const leaderZoneObj = leader.zoneObj;
        const leaderAfter = leader.insertAfter;
        const memberNames = [];

        for (let k = g.startIdx; k <= g.endIdx; k++) {
          const r = byGlobalIdx.get(k);
          if (!r) continue;
          r._groupId = gIdx + 1;
          r._groupSize = g.endIdx - g.startIdx + 1;
          r._groupLeaderName = leader.sourceName;
          r._groupPosInGroup = k - g.startIdx + 1;

          if (k === g.leaderIdx) {
            r._isGroupLeader = true;
            // 组首保持 AI 给的位置
          } else {
            // 组员跟随组首：zone 对齐到组首，insertAfter 用前一个组员的名字
            r.zone = leaderZone;
            r.zoneObj = leaderZoneObj;
            const prev = byGlobalIdx.get(k - 1);
            r.insertAfter = prev ? prev.entryName : leaderAfter;
            // ★ 组员的 cotPlan 也对齐到组首（统一挂到同一个 COT）
            if (leader.cotPlan) {
              r.cotPlan = JSON.parse(JSON.stringify(leader.cotPlan));
            }
          }
          memberNames.push(r.entryName);
        }
        console.log(`[缝合器][拍板] 组 ${gIdx + 1} 展开: ${memberNames.join(' → ')}（组首位置：${leaderZone} / ${leaderAfter}）`);
      });
    }


    console.log('[缝合器][拍板] normalized plans:', normalized);

    let html = `<div style="font-size:14px;font-weight:700;color:var(--wi-text);margin-bottom:10px">🤖 AI 缝合方案（${normalized.length} 条）</div>`;
    html += `<div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:10px">审阅下面的方案，可以直接改。确认后执行写入。</div>`;

    html += `<div style="max-height:500px;overflow-y:auto;border:1px solid var(--wi-border-soft);border-radius:6px">`;
    normalized.forEach((r, i) => {
      html += `
        <div class="wi-ps-review-row" data-idx="${i}" style="padding:10px;border-bottom:1px solid var(--wi-border-soft)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:11px;color:var(--wi-accent)">#${i + 1}</span>
            ${r._groupId ? `<span style="font-size:10px;color:var(--wi-ok);background:var(--wi-bg-2);padding:1px 6px;border-radius:3px">组${r._groupId} · 第${r._groupPosInGroup}/${r._groupSize}条</span>` : ''}
            ${r._isGroupLeader ? '<span style="font-size:10px;color:var(--wi-warn);background:var(--wi-bg-2);padding:1px 6px;border-radius:3px">组首</span>' : ''}
            <span style="font-size:12px;color:var(--wi-text);font-weight:600">${escapeHtml(r.sourceName)}</span>
            <span style="color:var(--wi-text-faint);font-size:10px">→ ${escapeHtml(r.entryName)}</span>
          </div>
          <div style="font-size:11px;color:var(--wi-text-dim);line-height:1.7;margin-bottom:6px">
            <b style="color:var(--wi-ok)">zone：</b>${escapeHtml(r.zone)}${r.zoneObj ? '' : ' <span style="color:var(--wi-err)">（⚠️ 不在 zone 列表）</span>'}
            &nbsp;·&nbsp;<b style="color:var(--wi-ok)">插到：</b>${escapeHtml(r.insertAfter === '__LAST__' ? '（区末尾）' : r.insertAfter === '__FIRST__' ? '（区开头）' : r.insertAfter)}
            ${r.wrapVar ? `&nbsp;·&nbsp;<b style="color:var(--wi-ok)">变量名：</b>${escapeHtml(r.wrapVar)}` : ''}
            ${r.cotPlan && r.cotPlan.type !== 'none' ? `&nbsp;·&nbsp;<b style="color:var(--wi-accent-2)">COT：</b>${r.cotPlan.type === 'new' ? '新建' : 'getvar'}${r.cotPlan.getvarTargetCot ? ' → ' + escapeHtml(r.cotPlan.getvarTargetCot) : ''}` : ''}
          </div>
          <div style="font-size:11px;color:var(--wi-text-dim);line-height:1.7;margin-bottom:6px">
            ${(() => {
          const isVarPreset = !!state.sutureTargetStructure?.varInitEntry;
          const forced = r._forceWrap;
          const finalWrap = forced === true ? true : forced === false ? false : isVarPreset;
          const src = forced === true ? '（手动：包）' : forced === false ? '（手动：不包）' : (isVarPreset ? '（目标预设是变量预设）' : '（目标预设无变量系统）');
          return `<b style="color:var(--wi-ok)">变量包裹：</b>` +
            `<span class="wi-ps-wrap-toggle" data-idx="${i}" style="cursor:pointer;padding:1px 8px;border-radius:4px;background:${finalWrap ? 'var(--wi-bg-2)' : 'var(--wi-bg-2)'};color:${finalWrap ? 'var(--wi-ok)' : 'var(--wi-warn)'};border:1px solid var(--wi-border)">${finalWrap ? '✓ 包' : '✗ 不包'}</span>` +
            ` <span style="color:var(--wi-text-faint);font-size:10px">${src}</span>`;
        })()}
          </div>
          ${r._isSelfCheck ? `<div style="font-size:11px;color:var(--wi-warn);background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:4px;padding:4px 8px;margin-bottom:6px">🛡️ 自检条目 → 写入时将挪到 <b>${escapeHtml(r._selfCheckTarget)}</b>（不走 AI 给的 zone）</div>` : ''}
          <div style="font-size:10px;color:var(--wi-text-dim);margin-bottom:6px">理由：${escapeHtml(r.reason)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="wi-ps-review-edit" data-idx="${i}" style="${BTN_CSS}padding:3px 10px;font-size:11px">✏️ 编辑</button>
            ${r._groupId && !r._isGroupLeader ? `<span style="font-size:10px;color:var(--wi-text-dim);align-self:center">（组员位置跟随组首）</span>` : ''}
            <button class="wi-ps-review-skip" data-idx="${i}" style="${BTN_CSS}padding:3px 10px;font-size:11px">跳过这条</button>
          </div>
        </div>
      `;
    });
    html += `</div>`;

    html += `
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button id="wi_ps_review_cancel" style="${BTN_CSS}">取消</button>
        <button id="wi_ps_review_execute" style="${BTN_PRIMARY_CSS}padding:8px 24px;font-size:13px">✅ 全部确认并写入</button>
      </div>
    `;

    showModal(html, ($m) => {
      $m.find('#wi_ps_review_cancel').on('click', () => $m.closest('#wi_ps_modal_mask').remove());
      $m.find('#wi_ps_review_execute').on('click', async () => {
        $m.closest('#wi_ps_modal_mask').remove();
        // ★ 如果开了"AI 学习 COT"，先预演一遍"要挂哪些 getvar 到哪些 COT 条目"，然后让 AI 重写
        if (state.sutureLearnCot) {
          const ok = await preRewriteCotEntries(normalized, structure);
          if (!ok) return; // 用户取消
        }
        await executeAiSuture(normalized, structure);
      });
      $m.find('.wi-ps-review-skip').on('click', function () {
        const idx = parseInt($(this).data('idx'), 10);
        const plan = normalized[idx];
        if (!plan) return;

        if (plan._groupId) {
          // ★ 组员 → 整组跳过
          const gid = plan._groupId;
          normalized.forEach((r, ri) => {
            if (r._groupId === gid) {
              r._skipped = true;
              $m.find(`.wi-ps-review-row[data-idx="${ri}"]`).css('opacity', 0.4);
              $m.find(`.wi-ps-review-row[data-idx="${ri}"] .wi-ps-review-skip`).prop('disabled', true).text('已跳过（整组）');
            }
          });
        } else {
          plan._skipped = true;
          $(this).closest('.wi-ps-review-row').css('opacity', 0.4);
          $(this).prop('disabled', true).text('已跳过');
        }
      });
      $m.find('.wi-ps-review-edit').on('click', function () {
        const idx = parseInt($(this).data('idx'), 10);
        editSuturePlanRow(normalized[idx], structure, () => {
          $m.closest('#wi_ps_modal_mask').remove();
          showSutureReviewTable(normalized.filter(x => !x._skipped), structure, items);
        });
      });
      // ★ 变量包裹切换：三态循环（自动 → 包 → 不包 → 自动）
      $m.find('.wi-ps-wrap-toggle').on('click', function () {
        const idx = parseInt($(this).data('idx'), 10);
        const plan = normalized[idx];
        if (!plan || !plan.zoneObj) return;
        if (plan._forceWrap === undefined) plan._forceWrap = true;
        else if (plan._forceWrap === true) plan._forceWrap = false;
        else plan._forceWrap = undefined;
        // 重渲染整表（会丢滚动位置，先这样）
        $m.closest('#wi_ps_modal_mask').remove();
        showSutureReviewTable(normalized.filter(x => !x._skipped), structure, items);
      });
    });
  }

  function editSuturePlanRow(plan, structure, onDone) {
    const MASK_ID = 'wi_ps_edit_row_mask';
    __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

    const $mask = $('<div id="' + MASK_ID + '">').css({
      position: 'fixed', inset: 0, background: 'var(--wi-mask)', zIndex: 1000020,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    const $box = $('<div>').addClass('wi-ps-mobile-box').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '8px',
      padding: '14px', width: '680px', maxWidth: '92vw', maxHeight: '88vh',
      overflow: 'auto', color: 'var(--wi-text)', boxShadow: 'var(--SmartThemeShadowColor, 0 8px 32px rgba(0,0,0,.6))',
    });

    // ★ 取出当前目标预设的所有有序条目（用于 insertAfter 下拉框）
    const targetEntries = extractOrderedEntries(state.sutureTargetPreset);

    // ★ 计算某个 zone 里的所有条目名
    function getZoneEntryNames(zone) {
      if (!zone) return [];
      const names = [];
      for (let i = zone.startIdx; i <= zone.endIdx && i < targetEntries.length; i++) {
        if (targetEntries[i]) names.push(targetEntries[i].name || '(无名称)');
      }
      return names;
    }

    // ★ 生成 zone 下拉框的 options
    const zoneOptionsHtml = structure.zones.map(z => {
      const sel = (z.name === plan.zone) ? ' selected' : '';
      const cnt = (z.endIdx - z.startIdx + 1);
      return `<option value="${escapeHtml(z.name)}"${sel}>${escapeHtml(z.name)}（${cnt} 条）</option>`;
    }).join('');

    // ★ 生成初始 insertAfter 下拉框的 options（基于当前 zone）
    const curZone = structure.zones.find(z => z.name === plan.zone) || null;
    function buildAfterOptionsHtml(zone, curVal) {
      const names = getZoneEntryNames(zone);
      let html = '';
      html += `<option value="__FIRST__"${curVal === '__FIRST__' ? ' selected' : ''}>⬆️ （区开头）</option>`;
      names.forEach((n, i) => {
        const sel = (n === curVal) ? ' selected' : '';
        html += `<option value="${escapeHtml(n)}"${sel}>${i + 1}. ${escapeHtml(n)}</option>`;
      });
      html += `<option value="__LAST__"${curVal === '__LAST__' ? ' selected' : ''}>⬇️ （区末尾）</option>`;
      // 如果 curVal 不在列表里（比如 AI 给的名字已失效），补一个"（原值，可能失效）"
      if (curVal && curVal !== '__FIRST__' && curVal !== '__LAST__' && !names.includes(curVal)) {
        html = `<option value="${escapeHtml(curVal)}" selected>⚠️ ${escapeHtml(curVal)}（原值，可能失效）</option>` + html;
      }
      return html;
    }

    // ★ 源条目内容预览（如果是导入 JSON / 粘贴，plan.sourceContent 可能有）
    const srcContent = String(plan.sourceContent || '').slice(0, 2000);

    const html = `
      <div style="font-size:13px;font-weight:700;color:var(--wi-text);margin-bottom:10px">✏️ 编辑方案：${escapeHtml(plan.sourceName)}</div>

      <div style="${LABEL_CSS}">分区</div>
      <select id="wi_ps_edit_zone" style="${INPUT_CSS}color-scheme:var(--SmartThemeColorScheme, dark)">
        ${zoneOptionsHtml}
      </select>

      <div style="${LABEL_CSS}">插到哪条之后</div>
      <select id="wi_ps_edit_after" style="${INPUT_CSS}color-scheme:var(--SmartThemeColorScheme, dark)">
        ${buildAfterOptionsHtml(curZone, plan.insertAfter)}
      </select>

      <div id="wi_ps_edit_preview" style="font-size:11px;color:var(--wi-ok);margin-top:6px;padding:6px 8px;background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:4px;line-height:1.6"></div>

      <div style="${LABEL_CSS}">条目名</div>
      <input id="wi_ps_edit_name" value="${escapeHtml(plan.entryName)}" style="${INPUT_CSS}">

      <div style="${LABEL_CSS}">变量名（留空=不包）</div>
      <input id="wi_ps_edit_var" value="${escapeHtml(plan.wrapVar || '')}" style="${INPUT_CSS}">

      <details style="margin-top:12px">
        <summary style="cursor:pointer;font-size:11px;color:var(--wi-text-dim)">查看源条目内容（前 2000 字）</summary>
        <textarea readonly style="width:100%;height:160px;background:var(--wi-bg-0);color:var(--wi-text-dim);border:1px solid var(--wi-border-soft);border-radius:4px;padding:6px;box-sizing:border-box;font-family:monospace;font-size:10px;margin-top:6px">${escapeHtml(srcContent, 999999)}</textarea>
      </details>

      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
        <button id="wi_ps_row_cancel" style="${BTN_CSS}">取消</button>
        <button id="wi_ps_row_save" style="${BTN_PRIMARY_CSS}">保存</button>
      </div>
    `;

    $box.html(html);
    $mask.append($box);
    $('#' + PANEL_ID).append($mask);

    const $zoneSel = $box.find('#wi_ps_edit_zone');
    const $afterSel = $box.find('#wi_ps_edit_after');
    const $preview = $box.find('#wi_ps_edit_preview');

    // ★ 刷新预览
    function refreshPreview() {
      const zoneName = $zoneSel.val();
      const afterVal = $afterSel.val();
      const zone = structure.zones.find(z => z.name === zoneName);
      if (!zone) {
        $preview.html('<span style="color:var(--wi-err)">⚠️ 找不到分区</span>');
        return;
      }
      const names = getZoneEntryNames(zone);
      let posDesc = '';
      if (afterVal === '__FIRST__') {
        posDesc = `将插到「${escapeHtml(zone.name)}」的<b>最前面</b>`;
        if (names[0]) posDesc += `（在「${escapeHtml(names[0])}」之前）`;
      } else if (afterVal === '__LAST__') {
        posDesc = `将插到「${escapeHtml(zone.name)}」的<b>最后面</b>`;
        if (names[names.length - 1]) posDesc += `（在「${escapeHtml(names[names.length - 1])}」之后）`;
      } else {
        const idx = names.indexOf(afterVal);
        if (idx >= 0) {
          const before = idx > 0 ? names[idx - 1] : null;
          const after = idx < names.length - 1 ? names[idx + 1] : null;
          posDesc = `将插到「${escapeHtml(afterVal)}」之后`;
          if (after) posDesc += `，在「${escapeHtml(after)}」之前`;
          else posDesc += `（该 zone 的最后一条之后）`;
        } else {
          posDesc = `<span style="color:var(--wi-warn)">⚠️ 该 zone 里找不到「${escapeHtml(afterVal)}」</span>`;
        }
      }
      $preview.html(posDesc);
    }

    // ★ zone 改变 → 刷新 insertAfter 下拉框
    $zoneSel.on('change', function () {
      const zone = structure.zones.find(z => z.name === $(this).val());
      $afterSel.html(buildAfterOptionsHtml(zone, '__LAST__'));
      refreshPreview();
    });
    $afterSel.on('change', refreshPreview);

    refreshPreview();

    $box.find('#wi_ps_row_cancel').on('click', () => $mask.remove());
    $box.find('#wi_ps_row_save').on('click', () => {
      const newZoneName = $zoneSel.val();
      plan.zone = newZoneName || plan.zone;
      plan.zoneObj = structure.zones.find(z => z.name === plan.zone) || null;
      plan.insertAfter = $afterSel.val() || '__LAST__';
      plan.entryName = $box.find('#wi_ps_edit_name').val().trim() || plan.sourceName;
      const v = $box.find('#wi_ps_edit_var').val().trim();
      plan.wrapVar = v || null;
      $mask.remove();
      if (onDone) onDone();
    });
  }

  // 在写入前预演：算出哪些 COT 条目会挂哪些 getvar，调 AI 重写，弹窗让用户 review
  async function preRewriteCotEntries(plans, structure) {
    const targets = plans.filter(p => !p._skipped);
    if (targets.length === 0) return true;

    // ★ 模拟 executeAiSuture 第一步，算出每个 COT 条目要挂哪些 getvar
    const cotZone = structure.zones.find(z => z.zoneType === 'cot');
    if (!cotZone) {
      console.log('[缝合器][COT重写] 没有 COT 区，跳过');
      return true;
    }

    const tgtPreset = state.sutureTargetPreset;
    const entries = extractOrderedEntries(tgtPreset);
    const enabledCotEntries = [];
    for (let i = cotZone.startIdx; i <= cotZone.endIdx && i < entries.length; i++) {
      const e = entries[i];
      if (e && e.enabled !== false && e.prompt && e.prompt.marker !== true) {
        enabledCotEntries.push(e);
      }
    }

    // 算出 cotName -> [getvarName, ...]
    const cotMap = new Map();
    for (const plan of targets) {
      const srcEntry = extractOrderedEntries(state.sutureSourcePreset).find(e => e.identifier === plan.sourceId);
      if (!srcEntry) continue;
      const srcContent = srcEntry.prompt.content || '';

      // ★ COT 条目本身不参与"要挂哪些变量"的计算
      if (plan._isCot) {
        continue;
      }
      // 算出这条会挂哪些变量（跟 executeAiSuture 里逻辑一致）
      const originalSetVars = parseSetVars(srcContent).filter(isAssignmentSetVar);
      const hasOwnVar = originalSetVars.length > 0;
      let effectiveWrapVar = plan.wrapVar;
      if (plan.cotPlan && plan.cotPlan.type === 'getvar' && plan.cotPlan.getvarName && !effectiveWrapVar) {
        effectiveWrapVar = plan.cotPlan.getvarName;
      }

      const varNames = [];
      if (hasOwnVar) {
        originalSetVars.forEach(s => varNames.push(s.name));
      } else if (effectiveWrapVar) {
        varNames.push(effectiveWrapVar);
      } else if (plan.cotPlan && plan.cotPlan.getvarName) {
        varNames.push(plan.cotPlan.getvarName);
      }

      if (varNames.length === 0) continue;

      // 找目标 COT 条目
      let targetCot = plan.cotPlan?.getvarTargetCot || '';
      let targetEntry = null;
      if (targetCot) {
        targetEntry = enabledCotEntries.find(e => e.name === targetCot);
      }
      if (!targetEntry) {
        targetEntry = enabledCotEntries[0]; // 兜底
      }
      if (!targetEntry) continue;

      const key = targetEntry.identifier;
      if (!cotMap.has(key)) {
        cotMap.set(key, { entry: targetEntry, vars: [] });
      }
      varNames.forEach(vn => {
        const srcContentFull = srcContent;
        cotMap.get(key).vars.push({
          name: vn,
          content: srcContentFull,
          sourceEntryName: srcEntry.name,
        });
      });
    }

    if (cotMap.size === 0) {
      console.log('[缝合器][COT重写] 没有要重写的 COT 条目');
      return true;
    }

    // ★ 一次请求重写所有 COT 条目
    const entriesToRewrite = Array.from(cotMap.entries()).map(([id, info]) => ({
      entryId: id,
      entryName: info.entry.name,
      originalContent: info.entry.prompt.content || '',
      vars: info.vars,
    }));

    console.log('[缝合器][COT重写] 要重写的 COT 条目:', entriesToRewrite.map(e => e.entryName));

    // ★ 显示全屏遮罩（防止误关）
    showLoadingMask(
      '🤖 AI 正在重写 COT 条目…',
      `共 ${entriesToRewrite.length} 个 COT 条目，可能需要 30~120 秒。请勿刷新页面。`
    );

    let batchResult;
    try {
      batchResult = await aiRewriteCotEntries(entriesToRewrite);
    } finally {
      hideLoadingMask();
    }

    // ★ 把 AI 返回的 rewrites 跟原条目对齐
    const rewriteResults = entriesToRewrite.map(e => {
      // 先按 entryName 精确匹配
      let matched = null;
      if (Array.isArray(batchResult.results)) {
        matched = batchResult.results.find(r => r.entryName === e.entryName);
        // 没精确匹配，就按顺序兜底
        if (!matched) {
          const idx = entriesToRewrite.findIndex(x => x.entryId === e.entryId);
          matched = batchResult.results[idx];
          if (matched) {
            console.warn(`[缝合器][COT重写] 「${e.entryName}」名字匹配失败，按顺序兜底`);
          }
        }
      }
      return {
        entryId: e.entryId,
        entryName: e.entryName,
        originalContent: e.originalContent,
        newContent: matched?.content || null,
        error: matched?.content ? null : (batchResult.error || '未在 AI 返回里找到对应条目'),
        vars: e.vars,
      };
    });

    // ★ 打印每个条目的对齐结果
    rewriteResults.forEach(r => {
      if (r.error) {
        console.warn(`[缝合器][COT重写] ❌「${r.entryName}」失败：${r.error}`);
      } else {
        console.log(`[缝合器][COT重写] ✅「${r.entryName}」重写成功（${r.newContent.length} 字）`);
      }
    });

    // ★ 弹窗让用户 review
    return new Promise((resolve) => {
      const MASK_ID = 'wi_ps_cot_rewrite_mask';
      __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

      const $mask = $('<div id="' + MASK_ID + '">').css({
        position: 'fixed', inset: 0, background: 'var(--wi-mask-strong)', zIndex: 1000040,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      });
      const $box = $('<div>').addClass('wi-ps-mobile-box').css({
        background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '8px',
        padding: '18px', width: '900px', maxWidth: '95vw', maxHeight: '90vh',
        overflow: 'auto', color: 'var(--wi-text)', boxShadow: 'var(--SmartThemeShadowColor, 0 8px 32px rgba(0,0,0,.6))',
      });

      let html = `<div style="font-size:15px;font-weight:700;color:var(--wi-accent-2);margin-bottom:10px">🤖 AI 重写的 COT 条目（${rewriteResults.length} 个）</div>`;
      html += `<div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:14px">下面的 COT 条目将被 AI 重写以融入新变量。你可以编辑，或直接使用。</div>`;

      rewriteResults.forEach((r, i) => {
        const failed = !!r.error;
        html += `
          <div class="wi-ps-cot-rewrite-block" data-idx="${i}" style="margin-bottom:16px;background:var(--wi-bg-1);border:1px solid var(--wi-border);border-radius:6px;padding:12px">
            <div style="font-size:13px;font-weight:600;color:${failed ? 'var(--wi-err)' : 'var(--wi-ok)'};margin-bottom:6px">
              #${i + 1} 「${escapeHtml(r.entryName)}」${failed ? ' ❌ AI 重写失败，将追加到末尾' : ' ✅ AI 重写成功'}
            </div>
            <div style="font-size:10px;color:var(--wi-text-dim);margin-bottom:8px">要挂的变量：${r.vars.map(v => escapeHtml(v.name)).join('、')}</div>
            ${failed ? `<div style="font-size:11px;color:var(--wi-err);margin-bottom:6px">失败原因：${escapeHtml(r.error)}</div>` : ''}
            <details style="margin-bottom:6px">
              <summary style="cursor:pointer;font-size:11px;color:var(--wi-text-dim)">查看原内容（点击展开）</summary>
              <textarea readonly style="width:100%;height:150px;background:var(--wi-bg-0);color:var(--wi-text-dim);border:1px solid var(--wi-border-soft);border-radius:4px;padding:6px;box-sizing:border-box;font-family:monospace;font-size:10px;margin-top:4px">${escapeHtml(r.originalContent, 999999)}</textarea>
            </details>
            ${failed ? '' : `
              <div style="font-size:11px;color:var(--wi-text-dim);margin-bottom:4px">重写后（可编辑）：</div>
              <textarea class="wi-ps-cot-rewrite-textarea" data-idx="${i}" style="width:100%;height:300px;background:var(--wi-bg-0);color:var(--wi-text);border:1px solid var(--wi-border);border-radius:4px;padding:8px;box-sizing:border-box;font-family:monospace;font-size:11px;resize:vertical">${escapeHtml(r.newContent, 999999)}</textarea>
            `}
          </div>
        `;
      });

      html += `
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">
          <button id="wi_ps_cot_rw_cancel" style="${BTN_CSS}">取消（不写入）</button>
          <button id="wi_ps_cot_rw_confirm" style="${BTN_PRIMARY_CSS}padding:8px 24px;font-size:13px">✅ 确认并写入</button>
        </div>
      `;

      $box.html(html);
      $mask.append($box);
      $('#' + PANEL_ID).append($mask);

      $box.find('#wi_ps_cot_rw_cancel').on('click', () => {
        $mask.remove();
        resolve(false);
      });

      $box.find('#wi_ps_cot_rw_confirm').on('click', () => {
        // 收集用户编辑后的内容
        $box.find('.wi-ps-cot-rewrite-textarea').each(function () {
          const idx = parseInt($(this).data('idx'), 10);
          if (!isNaN(idx) && rewriteResults[idx]) {
            rewriteResults[idx].newContent = $(this).val();
          }
        });
        $mask.remove();
        // 存到 state，executeAiSuture 里会用
        state.sutureCotRewrites = rewriteResults;
        resolve(true);
      });
    });
  }

  // ★ 配对词表
  const GROUP_START_WORDS = ['开始', '起始', 'start', 'begin', '╓'];
  const GROUP_END_WORDS = ['结束', '闭合', '尾部', 'end', 'close', '╜', '>>>'];

  // ★ 去掉 emoji / 标点 / 配对词，取"核心部分"
  function getGroupCoreName(name) {
    let s = String(name || '');
    // 去 emoji
    s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '');
    // 去配对词
    for (const w of GROUP_START_WORDS) s = s.split(w).join('');
    for (const w of GROUP_END_WORDS) s = s.split(w).join('');
    // 去标点、空格、符号
    s = s.replace(/[\s\.·\-—,，。、:：;；!！?？'"`~@#$%^&*()\[\]{}<>\/\\|+=]/g, '');
    return s.trim();
  }

  // ★ 判定两条是否"开始/结束配对"
  function isPairMatch(nameA, nameB) {
    const a = String(nameA || '');
    const b = String(nameB || '');
    const aIsStart = GROUP_START_WORDS.some(w => a.includes(w));
    const bIsEnd = GROUP_END_WORDS.some(w => b.includes(w));
    if (!aIsStart || !bIsEnd) return false;

    const coreA = getGroupCoreName(a);
    const coreB = getGroupCoreName(b);
    if (!coreA || !coreB) return false;

    // 更严格：一个 core 包含另一个，或者高度重叠
    if (coreA.includes(coreB) || coreB.includes(coreA)) {
      // 短的至少 2 字
      const shorter = coreA.length <= coreB.length ? coreA : coreB;
      return shorter.length >= 2;
    }
    // 否则：重叠字数 ≥ 短 core 的长度 - 1，且长度差 ≤ 2
    const shorter = coreA.length <= coreB.length ? coreA : coreB;
    const longer = coreA.length <= coreB.length ? coreB : coreA;
    if (Math.abs(coreA.length - coreB.length) > 2) return false;
    let overlap = 0;
    for (const ch of shorter) {
      if (longer.includes(ch)) overlap++;
    }
    return overlap >= Math.max(2, shorter.length - 1);
  }

  // ★ 检测源条目的分组
  // items: [{ sourceId, sourceName, sourceContent }, ...]（按源顺序）
  // 返回: [{ startIdx, endIdx, leaderIdx }, ...]
  function detectSourceGroups(items) {
    const groups = [];
    let i = 0;
    while (i < items.length) {
      // 从 i 开始，往后找配对的尾
      let found = -1;
      for (let j = i + 1; j < items.length; j++) {
        if (isPairMatch(items[i].sourceName, items[j].sourceName)) {
          found = j;
          break;  // 找最近的配对
        }
      }
      if (found > i + 1) {  // 至少 3 条（首+中+尾）才算组
        groups.push({ startIdx: i, endIdx: found, leaderIdx: i });
        i = found + 1;
      } else {
        i++;
      }
    }
    return groups;
  }

  // ★ 判定条目是不是"自检类"（需挪到 COT 区之后）
  // 命中 ≥2 条关键词才算
  function isSelfCheckEntry(content, entryName) {
    const text = String(content || '') + '\n' + String(entryName || '');
    const patterns = [
      /<!--/,                        // HTML 注释开头
      /\bAudit\b/i,                  // Audit
      /合规性扫描/,
      /逐字逐句/,
      /\[生成原稿\]/,
      /\[修正校准\]/,
    ];
    let hit = 0;
    for (const p of patterns) {
      if (p.test(text)) hit++;
      if (hit >= 2) return true;
    }
    return false;
  }

  // ★ 按 zone 判定：这个 zone 是否"用变量"
  // 返回 { shouldWrap: bool, ratio: number, hasVarCount: number, total: number }
  function judgeZoneHasVar(zone, preset) {
    const VAR_THRESHOLD = 0.5;  // 阈值，可调
    const fallback = { shouldWrap: true, ratio: 1, hasVarCount: 0, total: 0 };

    if (!zone || !preset) return fallback;

    const entries = extractOrderedEntries(preset);
    if (!entries.length) return fallback;

    let total = 0;
    let hasVarCount = 0;

    for (let i = zone.startIdx; i <= zone.endIdx && i < entries.length; i++) {
      const e = entries[i];
      if (!e || !e.prompt) continue;
      // 跳过 marker / 分隔行占位
      if (e.prompt.marker === true) continue;
      const content = e.prompt.content || '';
      if (!content.trim()) continue;  // 空内容不算
      total++;
      const setVars = parseSetVars(content).filter(isAssignmentSetVar);
      if (setVars.length > 0) hasVarCount++;
    }

    if (total === 0) return fallback;

    const ratio = hasVarCount / total;
    return {
      shouldWrap: ratio >= VAR_THRESHOLD,
      ratio: ratio,
      hasVarCount: hasVarCount,
      total: total,
    };
  }

  async function executeAiSuture(plans, structure) {
    console.log('[缝合器][写入] ===== 开始写入 =====');
    console.log('[缝合器][写入] 目标预设:', state.sutureTarget);
    console.log('[缝合器][写入] 待写入条数:', plans.filter(p => !p._skipped).length);
    console.log('[缝合器][写入] structure.varInitEntry:', structure?.varInitEntry);
    console.log('[缝合器][写入] structure.zones:', structure?.zones?.map(z => ({ name: z.name, type: z.zoneType, startIdx: z.startIdx, endIdx: z.endIdx })));
    // ★ 判断目标预设是否有变量系统
    const isVariablePreset = !!structure?.varInitEntry;
    console.log('[缝合器][写入] 目标预设是否有变量系统:', isVariablePreset);
    if (!isVariablePreset) {
      console.log('[缝合器][写入] → 走普通缝合模式（<> 包裹，不挂 getvar）');
    }

    const targets = plans.filter(p => !p._skipped);
    if (targets.length === 0) { alert('没有可写入的条目'); return; }

    for (const p of targets) {
      if (!p.zoneObj) { alert(`条目「${p.sourceName}」的分区「${p.zone}」不存在`); return; }
    }

    $('#wi_ps_suture_status').text('正在写入…').css('color', 'var(--wi-accent)');

    const tgtPreset = JSON.parse(JSON.stringify(state.sutureTargetPreset));
    let tgtPrompts = getNormalizedPrompts(tgtPreset);
    let tgtOrder = getPromptOrder(tgtPreset) || [];
    if (!tgtOrder.length) {
      tgtOrder = tgtPrompts.map(p => ({ identifier: p.identifier, enabled: p.enabled !== false }));
    }

    const srcEntries = extractOrderedEntries(state.sutureSourcePreset);

    const occupiedVars = new Set();
    tgtPrompts.forEach(p => parseSetVars(p.content || '').forEach(sv => occupiedVars.add(sv.name)));

    const varInitAppends = [];
    const cotGetvarAppends = new Map();

    const insertions = [];
    // ★ 预先找 COT 区 + COT 区之后紧邻的 zone（供自检条目用）
    let cotZone = null;
    let zoneAfterCot = null;
    for (let i = 0; i < structure.zones.length; i++) {
      if (structure.zones[i].zoneType === 'cot') {
        cotZone = structure.zones[i];
        zoneAfterCot = structure.zones[i + 1] || null;
        break;
      }
    }
    console.log('[缝合器][写入] COT 区:', cotZone?.name, ' COT 后第一个 zone:', zoneAfterCot?.name);

    // ★ 自检条目的插入顺序计数（保证多个自检按顺序排）
    let selfCheckCounter = 0;

    for (const plan of targets) {
      // ★ 粘贴模式：plan.sourceContent 直接有内容，不走源预设
      let clonedBase;
      if (plan.sourceContent !== undefined) {
        clonedBase = {
          identifier: plan.sourceId || uuid(),
          name: plan.sourceName || '(粘贴条目)',
          content: plan.sourceContent,
          role: 'system',
          enabled: true,
        };
      } else {
        const srcEntry = srcEntries.find(e => e.identifier === plan.sourceId);
        if (!srcEntry) {
          alert(`找不到源条目：${plan.sourceName}（id=${plan.sourceId}）`);
          return;
        }
        clonedBase = srcEntry.prompt;
      }

      const cloned = JSON.parse(JSON.stringify(clonedBase));
      const newId = uuid();
      // ★ legacy 预设：新条目必须同时有 id 和 identifier，且值相同
      //   原条目如果本来有 id，不要改它（但新条目没原 id，所以两个都设成 newId）
      cloned.identifier = newId;
      cloned.id = newId;   // ★ 无论如何都设 id，跟 identifier 保持一致
      // ★ 按开关给名字加来源后缀（如果名字里已有 [来自...] 则不重复加）
      let finalEntryName = plan.entryName;
      if (state.sutureNameSuffix && plan._sutureFrom && !/\[来自.+?\]\s*$/.test(finalEntryName)) {
        finalEntryName = finalEntryName + ' [来自' + plan._sutureFrom + ']';
      }
      cloned.name = finalEntryName;
      if (cloned.enabled === undefined) cloned.enabled = true;
      // ★ 缝合来源不塞条目里（酒馆会丢自定义字段），改存 extensions

      let content = cloned.content || '';
      const originalSetVars = parseSetVars(content).filter(isAssignmentSetVar);
      const hasOwnVar = originalSetVars.length > 0;

      // ★ 普通缝合模式（无变量系统）：用 <> 包裹，不包 setvar
      if (!isVariablePreset) {
        console.log(`[缝合器][写入] 处理「${plan.entryName}」（普通模式）`);
        // ★ 先剥离源条目里可能的 setvar 包裹
        const beforeStrip = content;
        content = stripSetvarWrappers(content);
        if (beforeStrip !== content) {
          console.log('[缝合器][写入]   已剥离 setvar 包裹（普通预设不需要变量）');
        }
        // 检测是否已有 <xxx>...</xxx> 包裹
        // ★ 放宽：只要"首个非空字符是 <标签>"，且"末尾是 </标签>"，就算已包裹
        //   不再要求整段严格匹配（允许前后有空行、说明文字、多个并列标签）
        const trimmed = String(content).trim();
        const firstTagMatch = trimmed.match(/^<([a-zA-Z_][\w-]*)(?:\s[^>]*)?>/);
        let hasTagWrap = false;
        if (firstTagMatch) {
          const tag = firstTagMatch[1];
          const closeRe = new RegExp('</' + tag + '\\s*>\\s*$');
          if (closeRe.test(trimmed)) {
            hasTagWrap = true;
          }
        }
        // ★ 兜底：如果整段里有成对的 <xxx>...</xxx> 包裹正文（至少一个完整对），也算
        if (!hasTagWrap) {
          const anyPairRe = /<([a-zA-Z_][\w-]*)(?:\s[^>]*)?>[\s\S]+?<\/\1\s*>/;
          if (anyPairRe.test(trimmed)) {
            hasTagWrap = true;
          }
        }

        if (hasTagWrap) {
          console.log('[缝合器][写入]   已有 <> 包裹，保持原样');
        } else {
          // 决定标签名：优先 plan.wrapTag，其次 plan.wrapVar，否则 entryName
          let tagName = plan.wrapTag || plan.wrapVar || plan.entryName || 'entry';
          // 清理非法字符：只保留字母、数字、下划线、短横、中文
          tagName = String(tagName).replace(/[^\w\u4e00-\u9fa5-]/g, '').trim() || 'entry';
          content = '<' + tagName + '>\n' + content.trim() + '\n</' + tagName + '>';
          console.log('[缝合器][写入]   → 用 <> 包裹，标签名:', tagName);
        }
        cloned.content = content;
        // 位置计算（跟后面一样）
        const entries0 = extractOrderedEntries(tgtPreset);
        const zone0 = plan.zoneObj;
        let afterEntryId0 = null;
        let isFirst0 = false;
        if (plan.insertAfter === '__FIRST__') {
          isFirst0 = true;
        } else if (plan.insertAfter === '__LAST__') {
          afterEntryId0 = entries0[zone0.endIdx]?.identifier || null;
        } else {
          let found0 = null;
          for (let i = zone0.startIdx; i <= zone0.endIdx && i < entries0.length; i++) {
            if (entries0[i] && entries0[i].name === plan.insertAfter) {
              found0 = entries0[i];
              break;
            }
          }
          if (!found0) {
            console.warn('[缝合器][写入] zone「' + zone0.name + '」内找不到条目「' + plan.insertAfter + '」，用 zone 末尾兜底');
            found0 = entries0[zone0.endIdx];
          }
          afterEntryId0 = found0 ? found0.identifier : null;
        }
        insertions.push({
          plan, cloned, newId, afterEntryId: afterEntryId0, isFirst: isFirst0, zone: zone0,
        });
        // 普通模式：不挂 getvar
        continue;
      }

      // ★ 自检条目：强制挪到 COT 区之后的第一个 zone 开头
      const isSelfCheck = isSelfCheckEntry(content, plan.entryName);
      if (isSelfCheck) {
        if (zoneAfterCot) {
          console.log('[缝合器][写入] 「' + plan.entryName + '」判定为自检条目 → 挪到「' + zoneAfterCot.name + '」开头');
          plan.zoneObj = zoneAfterCot;
          plan.zone = zoneAfterCot.name;
          plan.insertAfter = '__FIRST__';
          // 多个自检的排序：第 0 个插最前，第 1 个插在第 0 个之后，以此类推
          plan._selfCheckIdx = selfCheckCounter++;
        } else if (cotZone) {
          console.log('[缝合器][写入] 「' + plan.entryName + '」判定为自检条目 → COT 区是最后一个，挪到 COT 区末尾');
          plan.zoneObj = cotZone;
          plan.zone = cotZone.name;
          plan.insertAfter = '__LAST__';
          plan._selfCheckIdx = selfCheckCounter++;
        } else {
          console.warn('[缝合器][写入] 「' + plan.entryName + '」判定为自检条目，但没找到 COT 区，保持 AI 原位置');
        }
      }

      // ★ 变量模式：现有逻辑
      let effectiveWrapVar = plan.wrapVar;
      // ★ COT 条目本身不包变量（不管 cotPlan 说什么）
      // ★ 自检条目也不包变量
      if (plan._isCot || isSelfCheck) {
        effectiveWrapVar = null;
      } else if (plan.cotPlan && plan.cotPlan.type === 'getvar' && plan.cotPlan.getvarName && !effectiveWrapVar) {
        effectiveWrapVar = plan.cotPlan.getvarName;
      }

      // ★ 判定规则改为：只要目标预设是变量预设（有"获取变量区"），就全部包 setvar
      const zoneJudge = plan.zoneObj ? judgeZoneHasVar(plan.zoneObj, tgtPreset) : { shouldWrap: true, ratio: 1, hasVarCount: 0, total: 0 };
      // ★ 用户可以手动覆盖（plan._forceWrap: true / false / undefined）
      // ★ 自检条目强制不包
      let shouldWrapThisEntry;
      if (isSelfCheck) shouldWrapThisEntry = false;
      else if (plan._forceWrap === true) shouldWrapThisEntry = true;
      else if (plan._forceWrap === false) shouldWrapThisEntry = false;
      else shouldWrapThisEntry = isVariablePreset;   // ★ 有变量区就包，没有就不包

      console.log(`[缝合器][写入] 处理「${plan.entryName}」 sourceId=${plan.sourceId}`);
      console.log(`[缝合器][写入]   effectiveWrapVar=${effectiveWrapVar} hasOwnVar=${hasOwnVar}`);
      console.log(`[缝合器][写入]   zone判定: ${zoneJudge.hasVarCount}/${zoneJudge.total} = ${(zoneJudge.ratio * 100).toFixed(0)}% → shouldWrap=${zoneJudge.shouldWrap}`);
      console.log(`[缝合器][写入]   最终 shouldWrap=${shouldWrapThisEntry}`);
      console.log(`[缝合器][写入]   cotPlan=${JSON.stringify(plan.cotPlan)}`);

      // ★ 如果判定不包，且源条目自己没 setvar → 不包
      if (!shouldWrapThisEntry && !hasOwnVar) {
        console.log(`[缝合器][写入]   → zone 判定不包 setvar，直接放原文`);
        effectiveWrapVar = null;
      }

      if (effectiveWrapVar && !hasOwnVar) {
        let vname = effectiveWrapVar;
        if (occupiedVars.has(vname)) vname = findShiftedVarName(vname, occupiedVars);
        occupiedVars.add(vname);
        content = `{{setvar::${vname}::\n${content.trim()}\n}}`;
        varInitAppends.push(vname);
        console.log(`[缝合器][写入]   → 包了 setvar: ${vname}`);
      } else if (hasOwnVar) {
        originalSetVars.forEach(s => {
          const vname = s.name;
          if (occupiedVars.has(vname)) {
            const newName = findShiftedVarName(vname, occupiedVars);
            const re = new RegExp(`\\{\\{setvar::${escapeRegExp(vname)}::`, 'g');
            const re2 = new RegExp(`\\{\\{getvar::${escapeRegExp(vname)}\\}\\}`, 'g');
            content = content.replace(re, `{{setvar::${newName}::`).replace(re2, `{{getvar::${newName}}}`);
            occupiedVars.add(newName);
            varInitAppends.push(newName);
            console.log(`[缝合器][写入]   → 变量冲突顺延: ${vname} → ${newName}`);
          } else {
            occupiedVars.add(vname);
            varInitAppends.push(vname);
            console.log(`[缝合器][写入]   → 保留原变量: ${vname}`);
          }
        });
      }

      cloned.content = content;

      const entries = extractOrderedEntries(tgtPreset);
      const zone = plan.zoneObj;
      let afterEntryId = null;
      let isFirst = false;

      if (plan.insertAfter === '__FIRST__') {
        isFirst = true;
      } else if (plan.insertAfter === '__LAST__') {
        afterEntryId = entries[zone.endIdx]?.identifier || null;
      } else {
        let found = null;
        for (let i = zone.startIdx; i <= zone.endIdx && i < entries.length; i++) {
          if (entries[i] && entries[i].name === plan.insertAfter) {
            found = entries[i];
            break;
          }
        }
        if (!found) {
          // ★ 检查是不是"本批其他条目的名字"（链式插入）
          const chainTarget = insertions.find(x => x.plan.entryName === plan.insertAfter);
          if (chainTarget) {
            // 用链式目标的 newId 作为 afterEntryId
            afterEntryId = chainTarget.newId;
            console.log('[缝合器][写入] 位置「' + plan.insertAfter + '」是"本批条目"的名字（链式插入），用它的 newId 兜底');
            // 加个标记
            isFirst = false;
          } else {
            console.warn(`[缝合器][写入] zone「${zone.name}」内找不到条目「${plan.insertAfter}」，用 zone 末尾兜底`);
            found = entries[zone.endIdx];
            afterEntryId = found ? found.identifier : null;
          }
        } else {
          afterEntryId = found.identifier;
        }
      }

      insertions.push({
        plan, cloned, newId, afterEntryId, isFirst, zone,
      });

      // COT getvar 记录
      // ★ COT 条目本身不挂 getvar（它是被挂的目标，不是挂载者）
      if (plan._isCot || isSelfCheck) {
        console.log(`[缝合器][写入] 「${plan.entryName}」是 ${plan._isCot ? 'COT' : '自检'} 条目，跳过 getvar 挂载`);
      } else {
        // ★ 强制：只要这条带了 setvar（自己原本有 or wrapVar 包的），就必须挂 getvar
        const hasSetvarNow = parseSetVars(content).filter(isAssignmentSetVar).length > 0;

        if (!hasSetvarNow) {
          // zone 判定不包，或源条目没变量 → 不挂 getvar
          console.log(`[缝合器][写入] 「${plan.entryName}」没有 setvar（zone 判定不包），跳过 getvar 挂载`);
        } else {
          let shouldGetvar = false;
          let getvarName = null;
          let targetCotName = null;

          if (plan.cotPlan && plan.cotPlan.type === 'getvar') {
            shouldGetvar = true;
            getvarName = plan.cotPlan.getvarName || effectiveWrapVar;
            targetCotName = plan.cotPlan.getvarTargetCot || '';
          } else {
            shouldGetvar = true;
            getvarName = effectiveWrapVar || originalSetVars[0]?.name || null;
            targetCotName = '';
            console.warn(`[缝合器][写入] ⚠️ AI 没为「${plan.entryName}」返回 getvar，脚本强制兜底，变量=${getvarName}`);
          }

          if (shouldGetvar && getvarName) {
            if (!varInitAppends.includes(getvarName)) {
              varInitAppends.push(getvarName);
            }
            const key = targetCotName || '__AUTO__';
            if (!cotGetvarAppends.has(key)) cotGetvarAppends.set(key, []);
            cotGetvarAppends.get(key).push(getvarName);
          }
        }
      }
    }

    insertions.sort((a, b) => {
      const ai = a.plan.sourceIndex ?? 9999;
      const bi = b.plan.sourceIndex ?? 9999;
      return ai - bi;
    });

    console.log('[缝合器][写入] 插入顺序:', insertions.map(x => x.plan.entryName));

    for (const ins of insertions) {
      const orderIdxMap = new Map();
      tgtOrder.forEach((o, i) => orderIdxMap.set(o.identifier, i));

      let insertAt = tgtOrder.length;
      if (ins.isFirst) {
        const entries = extractOrderedEntries(tgtPreset);
        const firstId = entries[ins.zone.startIdx]?.identifier;
        insertAt = firstId ? (orderIdxMap.get(firstId) ?? 0) : 0;
        // ★ 自检条目：多个按顺序往后排
        if (ins.plan._selfCheckIdx !== undefined && ins.plan._selfCheckIdx > 0) {
          insertAt += ins.plan._selfCheckIdx;
          console.log(`[缝合器][写入] 自检条目「${ins.plan.entryName}」插入位置 +${ins.plan._selfCheckIdx} 偏移 → ${insertAt}`);
        }
      } else if (ins.afterEntryId) {
        const idx = orderIdxMap.get(ins.afterEntryId);
        if (idx !== undefined) {
          insertAt = idx + 1;
          // ★ 修正：如果前面已经插过同样 afterEntryId 的条目，就插到那条之后
          let moved = true;
          while (moved) {
            moved = false;
            // 看当前 insertAt 位置的条目，是不是本次批次插入的、且也是同 afterEntryId 的
            const curId = tgtOrder[insertAt]?.identifier;
            if (curId) {
              const prevIns = insertions.find(x => x.newId === curId && x.afterEntryId === ins.afterEntryId && x.newId !== ins.newId);
              if (prevIns) {
                insertAt++;
                moved = true;
              }
            }
          }
        } else {
          const prevIns = insertions.find(x => x.newId === ins.afterEntryId);
          if (prevIns) {
            const prevIdx = orderIdxMap.get(prevIns.newId);
            insertAt = (prevIdx !== undefined) ? prevIdx + 1 : tgtOrder.length;
          } else {
            console.warn(`[缝合器][写入] 找不到 ${ins.afterEntryId}，用 zone 末尾`);
            const entries = extractOrderedEntries(tgtPreset);
            const lastId = entries[ins.zone.endIdx]?.identifier;
            insertAt = lastId ? ((orderIdxMap.get(lastId) ?? -1) + 1) : tgtOrder.length;
          }
        }
      } else {
        const entries = extractOrderedEntries(tgtPreset);
        const lastId = entries[ins.zone.endIdx]?.identifier;
        insertAt = lastId ? ((orderIdxMap.get(lastId) ?? -1) + 1) : tgtOrder.length;
      }

      insertAt = Math.max(0, Math.min(insertAt, tgtOrder.length));
      tgtPrompts.push(ins.cloned);
      tgtOrder.splice(insertAt, 0, { identifier: ins.newId, enabled: true });
      console.log(`[缝合器][写入] 插入「${ins.plan.entryName}」到 index=${insertAt}`);
      console.log(`[缝合器][写入]   新条目 identifier=${ins.newId} 类型=${typeof ins.newId}`);
      console.log(`[缝合器][写入]   cloned.identifier=${ins.cloned.identifier} 类型=${typeof ins.cloned.identifier}`);
      console.log(`[缝合器][写入]   tgtOrder[${insertAt}]=${JSON.stringify(tgtOrder[insertAt])}`);
    }

    const newIdMap = new Map();
    tgtPrompts.forEach(p => newIdMap.set(p.identifier, p));
    const newOrderedEntries = [];
    tgtOrder.forEach(o => {
      const p = newIdMap.get(o.identifier);
      if (p) newOrderedEntries.push({ identifier: o.identifier, name: p.name || '(无名称)', prompt: p, enabled: o.enabled !== false });
    });

    const newZones = structure.zones.map(z => {
      // ★ startId/endId 为空时用名字兜底
      let sIdx = z.startId ? newOrderedEntries.findIndex(e => e.identifier === z.startId) : -1;
      let eIdx = z.endId ? newOrderedEntries.findIndex(e => e.identifier === z.endId) : -1;
      // 名字兜底（取 zone 里的第一条 / 最后一条的名字）
      if (sIdx < 0 && z.allNames && z.allNames[0]) {
        sIdx = newOrderedEntries.findIndex(e => e.name === z.allNames[0]);
        console.warn(`[缝合器][写入] zone「${z.name}」startId 定位失败，用名字兜底：「${z.allNames[0]}」→ idx=${sIdx}`);
      }
      if (eIdx < 0 && z.allNames && z.allNames[z.allNames.length - 1]) {
        eIdx = newOrderedEntries.findIndex(e => e.name === z.allNames[z.allNames.length - 1]);
        console.warn(`[缝合器][写入] zone「${z.name}」endId 定位失败，用名字兜底：「${z.allNames[z.allNames.length - 1]}」→ idx=${eIdx}`);
      }
      const s = sIdx >= 0 ? sIdx : z.startIdx;
      const e2 = eIdx >= 0 ? eIdx : z.endIdx;
      return {
        ...z,
        startIdx: s,
        endIdx: e2,
        entryCount: e2 - s + 1,
        allNames: newOrderedEntries.slice(s, e2 + 1).map(x => x.name),
        startId: newOrderedEntries[s]?.identifier || z.startId,
        endId: newOrderedEntries[e2]?.identifier || z.endId,
      };
    });

    // ★ 第四步：追加 setvar 到获取变量区
    const varInitId = findVarInitEntryId();
    console.log('[缝合器][写入] ===== 第四步：追加 setvar 到获取变量区 =====');
    console.log('[缝合器][写入] varInitId =', varInitId);
    console.log('[缝合器][写入] varInitAppends =', varInitAppends);
    console.log('[缝合器][写入] tgtPrompts 前 5 个 identifier =', tgtPrompts.slice(0, 5).map(p => p.identifier));

    if (varInitId && varInitAppends.length > 0) {
      const entry = tgtPrompts.find(p => p.identifier === varInitId);
      console.log('[缝合器][写入] 找到 varInitEntry 了吗 =', !!entry, entry?.name);
      if (entry) {
        const existing = entry.content || '';
        const existingSetVars = new Set();
        parseSetVars(existing).forEach(s => existingSetVars.add(s.name));
        const newVars = varInitAppends.filter(vn => !existingSetVars.has(vn));
        console.log('[缝合器][写入] 已存在的 setvar 数 =', existingSetVars.size);
        console.log('[缝合器][写入] 要新增的 setvar =', newVars);
        if (newVars.length > 0) {
          entry.content = existing + newVars.map(vn => `{{setvar::${vn}:: }}`).join('');
          console.log(`[缝合器][写入] ✅ 已追加 setvar 到「${entry.name}」`);
        } else {
          console.warn('[缝合器][写入] ⚠️ newVars 为空，全都已存在');
        }
      } else {
        console.error('[缝合器][写入] ❌ tgtPrompts 里找不到 varInitId 对应的条目！');
      }
    } else {
      console.warn('[缝合器][写入] ⚠️ 跳过 setvar 追加：varInitId=', varInitId, ' varInitAppends.length=', varInitAppends.length);
    }

    // ★ 第五步：追加 getvar 到 COT 区
    console.log('[缝合器][写入] ===== 第五步：追加 getvar 到 COT 区 =====');
    // ★ 如果开了 AI 学习 COT，用预重写的结果直接替换 COT 条目内容
    if (state.sutureLearnCot && Array.isArray(state.sutureCotRewrites) && state.sutureCotRewrites.length > 0) {
      console.log('[缝合器][写入] 使用 AI 重写的 COT 内容，条数:', state.sutureCotRewrites.length);
      for (const rw of state.sutureCotRewrites) {
        if (rw.error || !rw.newContent) {
          console.warn(`[缝合器][写入] 「${rw.entryName}」AI 重写失败，走追加末尾兜底`);
          continue;
        }
        // 在 tgtPrompts 里找到对应条目并替换内容
        const entry = tgtPrompts.find(p => p.identifier === rw.entryId);
        if (entry) {
          entry.content = rw.newContent;
          console.log(`[缝合器][写入] ✅ 已替换「${rw.entryName}」的内容为 AI 重写版`);
        } else {
          console.warn(`[缝合器][写入] ⚠️ 找不到条目 ${rw.entryId}`);
        }
      }
      // 重写成功后，清空 cotGetvarAppends 里已经被重写覆盖的
      state.sutureCotRewrites.forEach(rw => {
        if (rw.error || !rw.newContent) return;
        const entry = tgtPrompts.find(p => p.identifier === rw.entryId);
        if (!entry) return;
        // 从 cotGetvarAppends 里移除这个 COT 条目的 key（因为它已经在重写里了）
        // 注意 key 可能是条目名或 __AUTO__
        const namesToRemove = [entry.name, rw.entryName];
        for (const k of Array.from(cotGetvarAppends.keys())) {
          if (namesToRemove.includes(k)) {
            cotGetvarAppends.delete(k);
          }
        }
      });
    }
    console.log('[缝合器][写入] cotGetvarAppends =', Array.from(cotGetvarAppends.entries()));
    if (cotGetvarAppends.size === 0) {
      console.log('[缝合器][写入] ⚠️ 没有任何 cotPlan.type === "getvar" 的条目，所以不追加 getvar');
    }
    // ★ 预解析 COT 区"已启用条目"列表（给 __AUTO__ 和精确匹配兜底用）
    const cotZoneForGetvar = newZones.find(z => z.zoneType === 'cot');
    const enabledCotEntries = [];
    if (cotZoneForGetvar) {
      for (let i = cotZoneForGetvar.startIdx; i <= cotZoneForGetvar.endIdx && i < newOrderedEntries.length; i++) {
        const e = newOrderedEntries[i];
        if (e && e.prompt && e.prompt.enabled !== false && e.prompt.marker !== true) {
          enabledCotEntries.push(e);
        }
      }
    }
    console.log('[缝合器][写入] COT 区已启用条目:', enabledCotEntries.map(e => e.name));
    cotGetvarAppends.forEach((varNames, targetCotName) => {
      let targetEntry = null;

      // 1) 精确匹配 AI 指定的条目名（__AUTO__ 跳过）
      if (targetCotName && targetCotName !== '__AUTO__') {
        for (const e of enabledCotEntries) {
          if (e.name === targetCotName) {
            targetEntry = tgtPrompts.find(p => p.identifier === e.identifier);
            console.log(`[缝合器][写入] getvar 目标「${targetCotName}」精确匹配到条目`);
            break;
          }
        }
        if (!targetEntry) {
          console.warn(`[缝合器][写入] getvar 目标「${targetCotName}」没找到，走兜底`);
        }
      }

      // 2) 兜底：COT 区第一个已启用条目
      if (!targetEntry && enabledCotEntries.length > 0) {
        targetEntry = tgtPrompts.find(p => p.identifier === enabledCotEntries[0].identifier);
        console.log(`[缝合器][写入] getvar 兜底到 COT 区第一个已启用条目：「${enabledCotEntries[0].name}」`);
      }

      if (!targetEntry) {
        console.warn(`[缝合器][写入] ❌ 找不到任何已启用 COT 条目，跳过 getvar 追加：${varNames.join(', ')}`);
        return;
      }

      const existing = targetEntry.content || '';
      const existingGetVars = new Set();
      parseGetVars(existing).forEach(g => existingGetVars.add(g.name));
      const newVars = varNames.filter(vn => !existingGetVars.has(vn));
      console.log(`[缝合器][写入] COT target=${targetEntry.name} 新增 getvar=${newVars}`);
      if (newVars.length > 0) {
        const MARK_START = '/* WI-SUTURE-START */';
        const MARK_END = '/* WI-SUTURE-END */';
        const appends = newVars.map(vn => `{{getvar::${vn}}}`).join('\n');
        let newContent;
        if (existing.includes(MARK_START) && existing.includes(MARK_END)) {
          // 已有标记段：把新 getvar 插到标记段末尾前
          const si = existing.indexOf(MARK_START);
          const ei = existing.indexOf(MARK_END);
          const before = existing.slice(0, ei).replace(/\s+$/, '');  // 标记段内容，去尾部空白
          const after = existing.slice(ei);
          newContent = before + '\n' + appends + '\n' + after;
        } else {
          // 无标记段：新建
          newContent = existing.replace(/\s+$/, '') + '\n' + MARK_START + '\n' + appends + '\n' + MARK_END;
        }
        targetEntry.content = newContent;
        console.log(`[缝合器][写入] ✅ 已追加 getvar 到「${targetEntry.name}」（带标记）`);
      }
    });

    const tgtFmt = getPresetFormat(state.sutureTargetPreset);
    if (tgtFmt === 'modern') {
      if (tgtPreset.prompt_order && tgtPreset.prompt_order[0]) {
        tgtPreset.prompt_order[0].order = tgtOrder;
      } else {
        tgtPreset.prompt_order = [{ character_id: 100001, order: tgtOrder }];
      }
      tgtPreset.prompts = tgtPrompts;
    } else {
      console.log('[缝合器][写入] ===== legacy 分支：构建 prompts =====');
      console.log('[缝合器][写入]   tgtPrompts 长度:', tgtPrompts.length);
      console.log('[缝合器][写入]   tgtOrder 长度:', tgtOrder.length);
      const promptMap = new Map();
      tgtPrompts.forEach((p, i) => {
        if (!p.identifier) {
          console.warn(`[缝合器][写入] ⚠️ tgtPrompts[${i}] name=${p.name} identifier=undefined`);
        }
        promptMap.set(p.identifier, p);
      });
      const reordered = [];
      const missing = [];
      tgtOrder.forEach(o => {
        const p = promptMap.get(o.identifier);
        if (p) { p.enabled = o.enabled !== false; reordered.push(p); }
        else { missing.push(o.identifier); }
      });
      console.log('[缝合器][写入]   tgtOrder 里找不到 prompt 的 identifier:', missing);
      tgtPrompts.forEach(p => {
        if (!reordered.includes(p)) reordered.push(p);
      });
      console.log('[缝合器][写入]   reordered 长度:', reordered.length);
      tgtPreset.prompts = reordered;
      // ★ legacy 预设：prompts_unused 原样保留（如果原预设里有）
      if (Array.isArray(state.sutureTargetPreset.prompts_unused)) {
        tgtPreset.prompts_unused = JSON.parse(JSON.stringify(state.sutureTargetPreset.prompts_unused));
      }
    }

    if (!tgtPreset.extensions) tgtPreset.extensions = {};
    tgtPreset.extensions.wi_preset_suture_zones = newZones.map(z => ({
      startIdx: z.startIdx,
      endIdx: z.endIdx,
      name: z.name,
      zoneType: z.zoneType || 'other',
      reason: z.reason || '',
      entryCount: z.endIdx - z.startIdx + 1,
      startId: z.startId || '',
      endId: z.endId || '',
      allNames: z.allNames || [],
    }));

    // ★ 记录缝合来源：entry identifier -> 来源
    if (!tgtPreset.extensions.wi_preset_suture_origins) {
      tgtPreset.extensions.wi_preset_suture_origins = {};
    }
    for (const ins of insertions) {
      const from = ins.plan._sutureFrom;
      if (from) {
        tgtPreset.extensions.wi_preset_suture_origins[ins.newId] = from;
      }
    }
    console.log('[缝合器][写入] 记录缝合来源:', tgtPreset.extensions.wi_preset_suture_origins);

    console.log('[缝合器][写入] ===== 第六步：写回预设 =====');
    console.log('[缝合器][写入] tgtPreset.prompts 数量 =', tgtPreset.prompts?.length);
    console.log('[缝合器][写入] 检查新条目是否在 tgtPreset.prompts 里:');
    ['b1f00012-cd76-4044-99c0-de33979d37cc', '85412994-85f1-4fcc-87da-af05e5665980', 'ad6af7f4-8fa9-4944-923b-e471709a43c1'].forEach(id => {
      const found = tgtPreset.prompts.find(p => p.identifier === id);
      console.log('  ' + id + ' →', found ? '✅ 在' : '❌ 不在');
    });
    const badPrompts = (tgtPreset.prompts || []).map((p, i) => (!p || typeof p !== 'object' || !p.identifier) ? i : -1).filter(i => i >= 0);
    console.log('[缝合器][写入] 空洞/无效条目索引 =', badPrompts);
    // ★ 检查 identifier 为 undefined 的条目
    const noIdEntries = (tgtPreset.prompts || []).map((p, i) => ({ i, name: p?.name, id: p?.identifier }))
      .filter(x => !x.id);
    console.log('[缝合器][写入] identifier 为空的条目:', noIdEntries);
    const idCount = {};
    (tgtPreset.prompts || []).forEach(p => { if (p && p.identifier) idCount[p.identifier] = (idCount[p.identifier] || 0) + 1; });
    const dupIds = Object.entries(idCount).filter(([k, v]) => v > 1);
    console.log('[缝合器][写入] 重复 identifier =', dupIds);
    console.log('[缝合器][写入] prompt_order[0].order 数量 =', tgtPreset.prompt_order?.[0]?.order?.length);
    const varInitEntryFinal = tgtPrompts.find(p => p.identifier === varInitId);
    if (varInitEntryFinal) {
      console.log('[缝合器][写入] 获取变量区 content 末尾 300 字:\n', varInitEntryFinal.content?.slice(-300));
    }

    const backupId = await createBackup(state.sutureTarget, '缝合');   // ★ 写入前备份
    const ok = await writePreset(state.sutureTarget, tgtPreset);
    console.log('[缝合器][写入] writePreset 结果 =', ok, ' 备份 id =', backupId);

    if (ok) {
      // ★ 检查有没有 AI 重写失败的
      const failedRewrites = (state.sutureCotRewrites || []).filter(r => r.error || !r.newContent);
      if (state.sutureLearnCot && failedRewrites.length > 0) {
        const msg = failedRewrites.map(r => `「${r.entryName}」：getvar 已追加到末尾，请手动修改`).join('\n');
        if (window.toastr) window.toastr.warning(`有 ${failedRewrites.length} 个 COT 条目 AI 重写失败`);
        setTimeout(() => alert('⚠️ 以下 COT 条目 AI 重写失败，getvar 已按追加末尾处理，请手动修改：\n\n' + msg), 300);
      } else {
        if (window.toastr) window.toastr.success(`已缝合 ${targets.length} 条`);
      }
      $('#wi_ps_suture_status').html(`✅ 已缝合 ${targets.length} 条到「${escapeHtml(state.sutureTarget)}」`).css('color', 'var(--wi-ok)');
      // 清空 rewrite 缓存
      state.sutureCotRewrites = null;

      // ★ 写入完成 → 弹「撤销窗」
      showSutureDoneDialog(state.sutureTarget, targets.length, backupId);

      // ★ 自动刷新预设：如果目标预设 = 当前正在用的预设，切 select 强制酒馆重载
      try {
        const currentName = getCurrentPresetName();
        console.log('[缝合器][写入] 当前预设 =', currentName, ' 目标预设 =', state.sutureTarget);
        if (currentName && currentName === state.sutureTarget) {
          if (typeof window.loadPreset === 'function') {
            console.log('[缝合器][写入] 调用 window.loadPreset("' + currentName + '")');
            const ok2 = window.loadPreset(currentName);
            console.log('[缝合器][写入] loadPreset 返回:', ok2);
          } else {
            console.warn('[缝合器][写入] ⚠️ window.loadPreset 不存在，跳过刷新');
          }
        } else {
          console.log('[缝合器][写入] 目标预设不是当前使用中的预设，跳过刷新');
        }
      } catch (e) {
        console.warn('[缝合器][写入] 自动刷新失败（不影响写入）:', e);
      }

      // ★ 教程缝合：写入后弹 unmatched 提示
      if (state.tutorialUnmatched && state.tutorialUnmatched.length > 0) {
        const lines = state.tutorialUnmatched.map(u => '· ' + (u.tutorialLine || '') + ' — ' + (u.reason || '')).join('\n');
        setTimeout(() => {
          alert('⚠️ 以下教程内容未能匹配（未写入）：\n\n' + lines);
        }, 400);
        state.tutorialUnmatched = null;
      }

      // 重读一遍（确保拿到的是刷新后的数据）
      state.sutureTargetPreset = readPreset(state.sutureTarget);
      state.suturePick = {};
      setTimeout(() => {
        scanAndRenderStructure();
        renderSutureBody();
      }, 300);
    } else {
      alert('❌ 写入失败\n\n请按 F12 查看 Console 里的详细错误信息。');
      err('executeAiSuture 写入失败', tgtPreset);
    }
  }

  // ============================================================
  // [SUTURE DONE] 缝合完成弹窗（带撤销按钮）
  // ============================================================
  function showSutureDoneDialog(targetName, count, backupId) {
    const MASK_ID = 'wi_ps_suture_done_mask';
    __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

    const canUndo = !!backupId;

    const $mask = $('<div id="' + MASK_ID + '">').css({
      position: 'absolute', inset: 0, background: 'var(--wi-mask)', zIndex: 1000045,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '8px', boxSizing: 'border-box', overflowY: 'auto',
    });
    const $box = $('<div>').addClass('wi-ps-mobile-box').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '10px',
      padding: '20px 24px', width: '460px', maxWidth: '92vw', color: 'var(--wi-text)',
      boxShadow: 'var(--SmartThemeShadowColor, 0 12px 40px rgba(0,0,0,.6))',
      textAlign: 'center',
    });

    $box.html(`
      <div style="font-size:32px;margin-bottom:8px">✅</div>
      <div style="font-size:15px;font-weight:700;color:var(--wi-ok);margin-bottom:8px">缝合完成</div>
      <div style="font-size:12px;color:var(--wi-text);line-height:1.8;margin-bottom:6px">
        <b style="color:var(--wi-accent)">${count}</b> 条已写入「<b>${escapeHtml(targetName)}</b>」
      </div>
      <div style="font-size:11px;color:var(--wi-text-dim);line-height:1.6;margin-bottom:16px">
        ${canUndo
        ? '发现不对？可以立即撤销，回到缝合前的状态。'
        : '<span style="color:var(--wi-warn)">⚠️ 本次未成功创建备份，无法撤销</span>'}
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${canUndo ? `<button id="wi_ps_done_undo" style="${BTN_DANGER_CSS}padding:8px 20px;font-size:13px">↩️ 撤销这次缝合</button>` : ''}
        <button id="wi_ps_done_ok" style="${BTN_PRIMARY_CSS}padding:8px 24px;font-size:13px">好</button>
      </div>
    `);

    $mask.append($box);
    $('#' + PANEL_ID).append($mask);

    $box.find('#wi_ps_done_ok').on('click', () => $mask.remove());

    if (canUndo) {
      $box.find('#wi_ps_done_undo').on('click', async () => {
        const data = getBackupData(targetName, backupId);
        if (!data) { alert('快照数据已丢失，无法撤销'); $mask.remove(); return; }
        if (!confirm(`确定撤销这次缝合？\n\n「${targetName}」会恢复到缝合前的状态。`)) return;

        $mask.remove();
        showLoadingMask('↩️ 正在撤销…', '把预设恢复到缝合前');

        let ok = false;
        try {
          ok = await writePreset(targetName, JSON.parse(JSON.stringify(data)));
        } finally {
          hideLoadingMask();
        }

        if (ok) {
          if (window.toastr) window.toastr.success('✅ 已撤销到缝合前');
          // 如果撤销的是当前加载的预设，热重载
          try {
            const cur = getCurrentPresetName();
            if (cur === targetName && typeof window.loadPreset === 'function') {
              window.loadPreset(cur);
            }
          } catch (e) { }

          // 刷新界面
          state.sutureTargetPreset = readPreset(targetName);
          state.suturePick = {};
          setTimeout(() => {
            scanAndRenderStructure();
            renderSutureBody();
          }, 300);
        } else {
          alert('❌ 撤销写入失败，看 F12');
        }
      });
    }
  }

  function updateSutureStatus() {
    const picked = Object.entries(state.suturePick).filter(([_, v]) => v.checked);
    const n = picked.length;
    const $st = $('#wi_ps_suture_status');
    if ($st.length && $st.text().indexOf('✅') !== 0) {
      $st.text(n === 0 ? '未勾选任何条目' : `已勾选 ${n} 条`);
      $st.css('color', n === 0 ? 'var(--wi-text-dim)' : 'var(--wi-ok)');
    }
  }

  // ============================================================
  // [LOADING MASK] 全屏加载遮罩（防误关）
  // ============================================================
  let __wiLoadingMask = null;
  let __wiLoadingTimer = null;

  function showLoadingMask(text, subText) {
    hideLoadingMask();
    const MASK_ID = 'wi_ps_loading_mask';
    __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());

    const startTime = Date.now();
    const $mask = $('<div id="' + MASK_ID + '">').css({
      position: 'absolute', inset: 0,
      background: 'var(--wi-mask-strong)',
      zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column',
      cursor: 'wait',
      userSelect: 'none',
    });

    const $inner = $('<div>').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '10px',
      padding: '20px 24px', maxWidth: '90vw', minWidth: '260px',
      color: 'var(--wi-text)', textAlign: 'center',
      boxShadow: 'var(--SmartThemeShadowColor, 0 12px 40px rgba(0,0,0,.8))',
    });

    $inner.html(`
      <div style="font-size:28px;margin-bottom:12px">⏳</div>
      <div style="font-size:14px;color:var(--wi-accent-2);font-weight:600;margin-bottom:8px">${escapeHtml(text || '处理中')}</div>
      <div style="font-size:11px;color:var(--wi-text-dim);line-height:1.6;margin-bottom:14px">${escapeHtml(subText || '请勿关闭面板或刷新页面')}</div>
      <div id="wi_ps_loading_elapsed" style="font-size:12px;color:var(--wi-ok);font-family:monospace;margin-bottom:14px">已等待：0 秒</div>
      <div style="font-size:10px;color:var(--wi-text-faint);line-height:1.6">⚠️ 请勿刷新页面。如果长时间无响应，可以点下方按钮强制关闭。</div>
      <button id="wi_ps_loading_force" style="margin-top:12px;padding:5px 14px;background:var(--wi-bg-2);color:var(--wi-text);border:1px solid var(--wi-border);border-radius:6px;cursor:pointer;font-size:11px">强制关闭遮罩</button>
    `);

    $mask.append($inner);
    $('#' + PANEL_ID).append($mask);

    __wiLoadingMask = $mask;

    // 计时器：每 1 秒刷新"已等待 X 秒"
    __wiLoadingTimer = setInterval(() => {
      const sec = Math.floor((Date.now() - startTime) / 1000);
      const $el = $mask.find('#wi_ps_loading_elapsed');
      if ($el.length) {
        $el.text('已等待：' + sec + ' 秒');
        if (sec > 60) $el.css('color', 'var(--wi-warn)');
        if (sec > 180) $el.css('color', 'var(--wi-err)');
      }
    }, 1000);

    $mask.find('#wi_ps_loading_force').on('click', (e) => {
      e.stopPropagation();
      if (confirm('确定要强制关闭遮罩吗？\n\n如果 AI 还在请求中，关闭遮罩不会中断请求，但你将看不到进度。')) {
        hideLoadingMask();
      }
    });
  }

  function hideLoadingMask() {
    if (__wiLoadingTimer) {
      clearInterval(__wiLoadingTimer);
      __wiLoadingTimer = null;
    }
    if (__wiLoadingMask) {
      __wiLoadingMask.remove();
      __wiLoadingMask = null;
    }
    const MASK_ID = 'wi_ps_loading_mask';
    try {
      __wiRootDoc.querySelectorAll('#' + MASK_ID).forEach(el => el.remove());
    } catch (e) { }
  }

  // 更新遮罩文案（不重建）
  function updateLoadingMask(text, subText) {
    if (!__wiLoadingMask) return;
    if (text) __wiLoadingMask.find('div').eq(1).text(text);
    if (subText) __wiLoadingMask.find('div').eq(2).text(subText);
  }

  // ============================================================
  // [MODAL] 通用模态框
  // ============================================================
  function showModal(innerHtml, afterRender) {
    __wiRootDoc.querySelectorAll('#wi_ps_modal_mask').forEach(el => el.remove());
    const $mask = $('<div id="wi_ps_modal_mask">').css({
      position: 'fixed', inset: 0, background: 'var(--wi-mask-strong)', zIndex: 1000010,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    const $box = $('<div>').addClass('wi-ps-mobile-box').css({
      background: 'var(--wi-box-bg)', border: '1px solid var(--wi-border)', borderRadius: '8px',
      padding: '14px', width: '700px', maxWidth: '92vw', maxHeight: '85vh',
      overflow: 'auto', color: 'var(--wi-text)', boxShadow: 'var(--SmartThemeShadowColor, 0 8px 32px rgba(0,0,0,.6))',
    }).html(innerHtml);
    $mask.append($box);
    $('#' + PANEL_ID).append($mask);
    if (afterRender) afterRender($box);
    return $box;
  }

  // ============================================================
  // [PANEL DRAG] 面板拖动
  // ============================================================
  function bindPanelDrag() {
    const panelEl = __wiRootDoc.getElementById(PANEL_ID);
    const barEl = __wiRootDoc.getElementById('wi_ps_tab_bar');
    if (!panelEl || !barEl) return;

    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    let cachedW = 0, cachedVW = 0, cachedVH = 0;

    // ★ 用原生事件，不走 jQuery，避免 iframe / document 混淆
    barEl.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;

      // 排除 tab / 按钮 / 输入框 / 下拉框
      const t = ev.target;
      if (t.closest && t.closest('.wi-ps-tab, button, input, select, a, label')) {
        return;
      }

      ev.preventDefault();

      const rect = panelEl.getBoundingClientRect();
      startX = ev.clientX;
      startY = ev.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      dragging = true;

      cachedW = rect.width;
      cachedVW = (window.top && window.top.innerWidth) ? window.top.innerWidth : window.innerWidth;
      cachedVH = (window.top && window.top.innerHeight) ? window.top.innerHeight : window.innerHeight;

      // 一次性写，避免重排
      panelEl.style.willChange = 'left, top';
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
      panelEl.style.left = startLeft + 'px';
      panelEl.style.top = startTop + 'px';

      document.body.style.userSelect = 'none';
    });

    __wiRootDoc.addEventListener('mousemove', function (ev) {
      if (!dragging) return;
      ev.preventDefault();

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let nl = startLeft + dx;
      let nt = startTop + dy;

      nl = Math.max(80 - cachedW, Math.min(cachedVW - 80, nl));
      nt = Math.max(0, Math.min(cachedVH - 40, nt));

      panelEl.style.left = nl + 'px';
      panelEl.style.top = nt + 'px';
    });

    __wiRootDoc.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      panelEl.style.willChange = '';
    });
  }

  // ============================================================
  // [PANEL RESIZE] 面板缩放（拖右边缘 / 下边缘 / 右下角）
  // ============================================================
  function bindPanelResize() {
    const panelEl = __wiRootDoc.getElementById(PANEL_ID);
    if (!panelEl) return;

    // ★ 面板本身必须 position:fixed 才能用绝对定位的子手柄
    if (getComputedStyle(panelEl).position !== 'fixed') {
      panelEl.style.position = 'fixed';
    }

    // ---- 右手柄 ----
    const edgeR = __wiRootDoc.createElement('div');
    edgeR.className = 'wi-resize-edge wi-resize-right';
    edgeR.style.cssText = 'position:absolute;top:0;right:0;width:6px;height:100%;cursor:ew-resize;z-index:10;';
    panelEl.appendChild(edgeR);

    // ---- 下手柄 ----
    const edgeB = __wiRootDoc.createElement('div');
    edgeB.className = 'wi-resize-edge wi-resize-bottom';
    edgeB.style.cssText = 'position:absolute;left:0;bottom:0;height:6px;width:100%;cursor:ns-resize;z-index:10;';
    panelEl.appendChild(edgeB);

    // ---- 右下角手柄 ----
    const corner = __wiRootDoc.createElement('div');
    corner.className = 'wi-resize-edge wi-resize-corner';
    corner.style.cssText = 'position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;z-index:11;';
    panelEl.appendChild(corner);

    let resizing = null; // 'right' | 'bottom' | 'corner'
    let startX = 0, startY = 0, startW = 0, startH = 0;
    let startL = 0, startT = 0;
    let vw = 0, vh = 0;

    function beginResize(mode, ev) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();

      const rect = panelEl.getBoundingClientRect();
      resizing = mode;
      startX = ev.clientX;
      startY = ev.clientY;
      startW = rect.width;
      startH = rect.height;
      startL = rect.left;
      startT = rect.top;
      vw = (window.top && window.top.innerWidth) ? window.top.innerWidth : window.innerWidth;
      vh = (window.top && window.top.innerHeight) ? window.top.innerHeight : window.innerHeight;

      // 锁定 left/top（避免用 right/bottom 定位时改宽会往左长）
      panelEl.style.willChange = 'width, height';
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
      panelEl.style.left = startL + 'px';
      panelEl.style.top = startT + 'px';

      document.body.style.userSelect = 'none';
    }

    edgeR.addEventListener('mousedown', (ev) => beginResize('right', ev));
    edgeB.addEventListener('mousedown', (ev) => beginResize('bottom', ev));
    corner.addEventListener('mousedown', (ev) => beginResize('corner', ev));

    const MIN_W = 480;
    const MIN_H = 360;
    const MAX_W = () => vw - 20;
    const MAX_H = () => vh - 20;

    __wiRootDoc.addEventListener('mousemove', function (ev) {
      if (!resizing) return;
      ev.preventDefault();

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (resizing === 'right' || resizing === 'corner') {
        let newW = startW + dx;
        newW = Math.max(MIN_W, Math.min(MAX_W(), newW));
        panelEl.style.width = newW + 'px';
      }
      if (resizing === 'bottom' || resizing === 'corner') {
        let newH = startH + dy;
        newH = Math.max(MIN_H, Math.min(MAX_H(), newH));
        panelEl.style.height = newH + 'px';
      }
    });

    __wiRootDoc.addEventListener('mouseup', function () {
      if (!resizing) return;
      resizing = null;
      document.body.style.userSelect = '';
      panelEl.style.willChange = '';
    });
  }

  // ============================================================
  // [KILL] 清理函数
  // ============================================================
  __wiInstanceInfo.kill = function __wiKillSelf() {
    try {
      log('正在清理实例 v' + WI_VERSION);
      const sels = ['#' + BTN_ID, '#' + PANEL_ID, '#wi_ps_modal_mask', '#wi_ps_suture_done_mask'];
      sels.forEach(sel => {
        try { __wiRootDoc.querySelectorAll(sel).forEach(el => el.remove()); } catch (e) { }
      });
      try {
        __wiTopWin.__wiInstances = (__wiTopWin.__wiInstances || []).filter(i => i !== __wiInstanceInfo);
      } catch (e) { }
      log('实例已清理');
    } catch (e) {
      err('清理失败', e);
    }
  };

  // ============================================================
  // [BOOT] 启动
  // ============================================================
  const apiReady = await waitTavernHelperAPI(25);
  if (!apiReady) return;

  buildUI();
  refreshPresetList();

  window.__wiPresetSuture = {
    show: togglePanel,
    hide: () => $('#' + PANEL_ID).hide(),
    state,
    parseSetVars,
    parseGetVars,
  };

  log('🚀 psycho缝合 v' + WI_VERSION + ' 已启动');

})();
