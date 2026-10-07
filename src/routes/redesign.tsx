import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Bell,
  Bookmark,
  Camera,
  ChevronRight,
  Clock3,
  FileImage,
  FolderOpen,
  Heart,
  ImagePlus,
  Inbox,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Play,
  Plus,
  Search,
  Send,
  Sparkles,
  Star,
  Wand2,
  X,
  Zap,
} from "lucide-react";

type Page = "today" | "feed" | "messages" | "imagine" | "vault" | "journal";

type Palette = {
  background: string;
  foreground: string;
  muted: string;
  dim: string;
  accent: string;
  accent2: string;
};

const artwork: CSSProperties[] = [
  { background: "radial-gradient(circle at 18% 14%, #f3dfbb 0, #c59c72 26%, #5d4034 56%, #181416 100%)" },
  { background: "radial-gradient(circle at 78% 22%, #c5e9df 0, #6b9c9d 27%, #273747 55%, #14161b 100%)" },
  { background: "radial-gradient(circle at 68% 18%, #eed1e6 0, #b37aa0 31%, #4a3152 61%, #141318 100%)" },
  { background: "radial-gradient(circle at 30% 80%, #f4dcb0 0, #d26f56 30%, #533236 60%, #171417 100%)" },
  { background: "radial-gradient(circle at 80% 74%, #d7efb5 0, #78a06f 30%, #2b4037 58%, #121713 100%)" },
];

const people = [
  { name: "lena", label: "Лена", tone: "from-[#f0c8b1] to-[#8d5a54]", unread: 3, note: "сейчас в сети" },
  { name: "max", label: "Макс", tone: "from-[#b7d7d8] to-[#4d666c]", unread: 0, note: "12 мин назад" },
  { name: "nina", label: "Нина", tone: "from-[#e3bfd9] to-[#68476a]", unread: 1, note: "печатает…" },
  { name: "roma", label: "Рома", tone: "from-[#e5c889] to-[#7e6541]", unread: 0, note: "вчера" },
];

const messages = [
  { from: "them", text: "я нашла место, о котором говорила", time: "21:14" },
  { from: "them", text: "кинуть фотку?", time: "21:14" },
  { from: "me", text: "да. и ту, где свет был странный — она очень нравится", time: "21:16" },
  { from: "them", text: "сек. сейчас попробую продолжить сцену", time: "21:17" },
];

const files = [
  { name: "late-summer-01.jpg", meta: "RAW · 18.4 MB", tag: "selected", style: artwork[0] },
  { name: "studio-contact.png", meta: "PNG · 4.1 MB", tag: "imagine", style: artwork[2] },
  { name: "voice-note.m4a", meta: "Audio · 7.2 MB", tag: "chat", style: null },
  { name: "sunday-window.jpg", meta: "JPG · 12.8 MB", tag: "feed", style: artwork[1] },
];

const journal = [
  { day: "Сегодня", title: "После дождя", meta: "3 кадра · Лена · 21:14", mood: "quiet", style: artwork[1] },
  { day: "Вчера", title: "Жёлтый автобус", meta: "7 кадров · offline notes", mood: "warm", style: artwork[3] },
  { day: "18 сент.", title: "Длинный коридор", meta: "5 кадров · studio", mood: "soft", style: artwork[4] },
];

function Pill({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return <span className={`pill ${active ? "pill-active" : ""}`}>{children}</span>;
}

function IconButton({ label, children, onClick, active = false }: { label: string; children: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`icon-button ${active ? "icon-button-active" : ""}`}>
      {children}
    </button>
  );
}

function Avatar({ name, size = "md", tone }: { name: string; size?: "sm" | "md" | "lg"; tone?: string }) {
  const person = people.find((item) => item.name === name);
  return (
    <div className={`avatar avatar-${size} ${person?.tone ?? tone ?? "from-[#d6d3ce] to-[#6d6861]"}`}>
      <span>{(person?.label ?? name).slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

export const Route = () => <Redesign />;

function Redesign() {
  const [page, setPage] = useState<Page>("today");
  const [selectedThread, setSelectedThread] = useState("lena");
  const [message, setMessage] = useState("");
  const [liked, setLiked] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [prompt, setPrompt] = useState("поздний вечер, мокрый асфальт, тёплый свет из окна");
  const [vaultFilter, setVaultFilter] = useState<"all" | "feed" | "imagine" | "chat">("all");
  const [focus, setFocus] = useState(false);

  const palette: Palette = useMemo(
    () => ({
      background: "#0c0d0e",
      foreground: "#f5f2eb",
      muted: "#a7a39b",
      dim: "#6f706d",
      accent: "#d6ff63",
      accent2: "#9e8cff",
    }),
    [],
  );

  const nav = [
    { id: "today" as Page, label: "Сегодня", icon: LayoutGrid },
    { id: "feed" as Page, label: "Лента", icon: Camera },
    { id: "messages" as Page, label: "Личка", icon: MessageCircle, count: 4 },
    { id: "imagine" as Page, label: "Imagine", icon: Wand2 },
    { id: "vault" as Page, label: "Vault", icon: FolderOpen },
    { id: "journal" as Page, label: "Journal", icon: Clock3 },
  ];

  const go = (next: Page) => {
    setPage(next);
    setFocus(false);
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessage("");
  };

  return (
    <div className="shtora-next" style={{ "--sx-bg": palette.background, "--sx-fg": palette.foreground, "--sx-accent": palette.accent, "--sx-accent2": palette.accent2 } as CSSProperties}>
      <aside className="next-rail">
        <div className="next-brand" onClick={() => go("today")} role="button" tabIndex={0}>
          <span className="brand-mark">Ш</span>
          <span><strong>ШТОРА</strong><small>your private world</small></span>
        </div>

        <nav className="next-nav" aria-label="Основная навигация">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={`next-nav-item ${page === item.id ? "is-active" : ""}`} onClick={() => go(item.id)}>
                <span className="next-nav-icon"><Icon size={18} strokeWidth={1.9} /></span>
                <span>{item.label}</span>
                {item.count ? <em>{item.count}</em> : null}
              </button>
            );
          })}
        </nav>

        <div className="rail-spacer" />
        <div className="rail-card">
          <span className="live-dot" />
          <div>
            <strong>Сцена жива</strong>
            <small>identity · light · place</small>
          </div>
          <ArrowUpRight size={16} />
        </div>
        <Link to="/" className="back-current">← текущая версия</Link>
      </aside>

      <header className="next-mobile-head">
        <button type="button" className="mobile-brand" onClick={() => go("today")}>Ш / ШТОРА</button>
        <div className="mobile-head-actions">
          <IconButton label="Поиск" onClick={() => setFocus(true)}><Search size={18} /></IconButton>
          <IconButton label="Уведомления"><Bell size={18} /></IconButton>
        </div>
      </header>

      <main className="next-main">
        <div className="next-topbar">
          <div>
            <div className="eyebrow">SHTORA / 04</div>
            <h1>{pageTitle(page)}</h1>
          </div>
          <div className="next-top-actions">
            <button type="button" className="ghost-link" onClick={() => setFocus(true)}><Search size={17} /> поиск</button>
            <IconButton label="Уведомления"><Bell size={18} /></IconButton>
            <Avatar name="you" size="sm" tone="from-[#e4dfd2] to-[#6d6659]" />
          </div>
        </div>

        {page === "today" ? (
          <Today onNavigate={go} liked={liked} onLike={() => setLiked((v) => !v)} />
        ) : null}

        {page === "feed" ? (
          <Feed liked={liked} onLike={() => setLiked((v) => !v)} onNavigate={go} />
        ) : null}

        {page === "messages" ? (
          <Messages
            selectedThread={selectedThread}
            setSelectedThread={setSelectedThread}
            message={message}
            setMessage={setMessage}
            onSend={sendMessage}
          />
        ) : null}

        {page === "imagine" ? (
          <Imagine prompt={prompt} setPrompt={setPrompt} generated={generated} onGenerate={() => setGenerated(true)} />
        ) : null}

        {page === "vault" ? (
          <Vault filter={vaultFilter} setFilter={setVaultFilter} />
        ) : null}

        {page === "journal" ? (
          <Journal onNavigate={go} />
        ) : null}
      </main>

      <nav className="next-mobile-nav" aria-label="Разделы">
        {nav.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" className={page === item.id ? "is-active" : ""} onClick={() => go(item.id)}>
              <Icon size={19} />
              <span>{item.label === "Imagine" ? "Imagine" : item.label}</span>
            </button>
          );
        })}
      </nav>

      {focus ? (
        <div className="focus-layer" role="dialog" aria-modal="true" aria-label="Быстрый поиск">
          <div className="focus-panel">
            <div className="focus-head"><span>Поиск по Шторе</span><IconButton label="Закрыть" onClick={() => setFocus(false)}><X size={18} /></IconButton></div>
            <div className="focus-input"><Search size={20} /><input autoFocus placeholder="люди, сцены, файлы, слова…" onKeyDown={(e) => e.key === "Escape" && setFocus(false)} /></div>
            <div className="focus-suggestions"><Pill active>после дождя</Pill><Pill>Лена</Pill><Pill>зимние фото</Pill><Pill>voice notes</Pill></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pageTitle(page: Page) {
  return ({ today: "Сегодня", feed: "Лента", messages: "Личка", imagine: "Imagine", vault: "Vault", journal: "Journal" })[page];
}

function Today({ onNavigate, liked, onLike }: { onNavigate: (page: Page) => void; liked: boolean; onLike: () => void }) {
  return (
    <div className="page-stack">
      <section className="hero-grid">
        <div className="hero-card">
          <div className="hero-meta"><Pill active>LIVE WORLD</Pill><span>21:18 / Вечер</span></div>
          <div className="hero-copy">
            <span className="hero-kicker">Сегодняшнее состояние</span>
            <h2>Не просто лента.<br /><i>Следующий кадр.</i></h2>
            <p>Штора собирает сообщения, кадры и файлы в одну живую историю — без ощущения, что ты прыгаешь между приложениями.</p>
          </div>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={() => onNavigate("feed")}>Открыть ленту <ArrowUpRight size={17} /></button>
            <button type="button" className="soft-button" onClick={() => onNavigate("imagine")}><Sparkles size={16} /> продолжить сцену</button>
          </div>
          <div className="hero-orb orb-a" />
          <div className="hero-orb orb-b" />
        </div>

        <button type="button" className="story-card tall-card" onClick={() => onNavigate("feed")}>
          <div className="art art-story" style={artwork[1]}>
            <div className="story-top"><span>LE</span><span>12%</span></div>
            <div className="story-caption"><small>ЛЕНА</small><strong>«поздно, но здесь хорошо»</strong></div>
          </div>
          <div className="story-foot"><span>история · 11 мин назад</span><ArrowUpRight size={16} /></div>
        </button>
      </section>

      <div className="section-heading">
        <div><span className="eyebrow">AT A GLANCE</span><h3>Всё, что происходит сейчас</h3></div>
        <button type="button" className="text-button" onClick={() => onNavigate("journal")}>открыть journal <ChevronRight size={16} /></button>
      </div>

      <section className="signal-grid">
        <button type="button" className="signal-card signal-chat" onClick={() => onNavigate("messages")}>
          <div className="card-head"><div><span className="mini-label">01 / ЛИЧКА</span><h4>4 новых</h4></div><MessageCircle size={18} /></div>
          <div className="people-stack">{people.slice(0, 3).map((person) => <Avatar key={person.name} name={person.name} size="sm" />)}</div>
          <p><strong>Лена:</strong> «сейчас попробую продолжить сцену»</p>
          <span className="card-arrow"><ArrowUpRight size={16} /></span>
        </button>

        <button type="button" className="signal-card signal-imagine" onClick={() => onNavigate("imagine")}>
          <div className="card-head"><div><span className="mini-label">02 / IMAGINE</span><h4>Сцена готова</h4></div><Wand2 size={18} /></div>
          <div className="imagine-preview" style={artwork[2]}>
            <span><Sparkles size={15} /> raw smartphone</span>
          </div>
          <p>Готово продолжить кадр из лички без потери света и одежды.</p>
        </button>

        <button type="button" className="signal-card signal-vault" onClick={() => onNavigate("vault")}>
          <div className="card-head"><div><span className="mini-label">03 / VAULT</span><h4>28.6 GB</h4></div><FolderOpen size={18} /></div>
          <div className="vault-row"><span>Сохранено сегодня</span><strong>14 файлов</strong></div>
          <div className="storage-bar"><i style={{ width: "68%" }} /></div>
          <div className="vault-types"><span>RAW</span><span>PNG</span><span>CHAT</span><span>+ 2</span></div>
        </button>
      </section>

      <section className="feed-feature">
        <div className="section-heading compact"><div><span className="eyebrow">FROM YOUR WORLD</span><h3>Последний кадр</h3></div><button type="button" className="text-button" onClick={() => onNavigate("feed")}>лента <ChevronRight size={16} /></button></div>
        <article className="feature-post">
          <div className="feature-art" style={artwork[0]}>
            <span className="frame-tag">09 / 24</span>
            <span className="frame-note">21:04 · #shtora</span>
          </div>
          <div className="feature-info">
            <div className="post-author"><Avatar name="lena" size="md" /><div><strong>lena.made</strong><span>Barcelona · 11 min</span></div><MoreHorizontal size={18} /></div>
            <h4>вышла на пять минут и случайно нашла самый тёплый свет на районе</h4>
            <div className="post-actions"><div><IconButton label="Нравится" active={liked} onClick={onLike}><Heart size={19} fill={liked ? "currentColor" : "none"} /></IconButton><IconButton label="Комментарий"><MessageCircle size={19} /></IconButton><IconButton label="Сохранить"><Bookmark size={19} /></IconButton></div><span>148 likes · 23 comments</span></div>
            <div className="comment-preview"><span>max.jpg</span><p>свет 🔥</p><span>1h</span></div>
          </div>
        </article>
      </section>
    </div>
  );
}

function Feed({ liked, onLike, onNavigate }: { liked: boolean; onLike: () => void; onNavigate: (page: Page) => void }) {
  return (
    <div className="page-stack">
      <div className="feed-toolbar">
        <div className="filter-pills"><Pill active>Для тебя</Pill><Pill>Личное</Pill><Pill>Сохранённое</Pill></div>
        <button type="button" className="soft-button" onClick={() => onNavigate("imagine")}><Plus size={16} /> новый кадр</button>
      </div>

      <div className="story-strip">
        <button type="button" className="story-add"><span><Plus size={20} /></span><small>твоя история</small></button>
        {people.map((person, index) => (
          <button type="button" className="story-person" key={person.name}>
            <span className={`story-ring ${index === 0 ? "ring-live" : ""}`}><Avatar name={person.name} size="lg" /></span>
            <small>{person.label}</small>
          </button>
        ))}
      </div>

      <div className="feed-grid">
        {[0,1,2,3].map((index) => (
          <article className={`mosaic-post ${index === 0 ? "mosaic-large" : ""}`} key={index}>
            <div className="mosaic-art" style={artwork[index % artwork.length]}>
              <span className="mosaic-index">0{index + 1}</span>
              <button type="button" className="mosaic-play" aria-label="Открыть пост">{index === 1 ? <Play size={14} fill="currentColor" /> : <ArrowUpRight size={15} />}</button>
              {index === 0 ? <span className="mosaic-caption">late light / no plan</span> : null}
            </div>
            <div className="mosaic-meta"><Avatar name={people[index % people.length].name} size="sm" /><div><strong>{people[index % people.length].name}.made</strong><span>{index + 3}ч</span></div><IconButton label="Сохранить"><Bookmark size={16} /></IconButton></div>
            {index === 0 ? <div className="mosaic-actions"><IconButton label="Нравится" active={liked} onClick={onLike}><Heart size={18} fill={liked ? "currentColor" : "none"} /></IconButton><span>148 likes</span><button type="button" onClick={() => onNavigate("messages")}><MessageCircle size={17} /> 23</button></div> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function Messages({ selectedThread, setSelectedThread, message, setMessage, onSend }: { selectedThread: string; setSelectedThread: (v: string) => void; message: string; setMessage: (v: string) => void; onSend: () => void }) {
  return (
    <div className="messages-layout">
      <aside className="thread-list">
        <div className="thread-search"><Search size={17} /><input placeholder="поиск" /></div>
        {people.map((person) => (
          <button type="button" key={person.name} className={`thread-row ${selectedThread === person.name ? "selected" : ""}`} onClick={() => setSelectedThread(person.name)}>
            <Avatar name={person.name} size="md" />
            <span className="thread-copy"><strong>{person.label}</strong><small>{person.name === "lena" ? "сейчас попробую продолжить сцену" : "последнее сообщение вчера"}</small></span>
            <span className="thread-time">{person.unread ? <em>{person.unread}</em> : "12m"}</span>
          </button>
        ))}
        <button type="button" className="new-chat-button"><Plus size={17} /> новая переписка</button>
      </aside>

      <section className="chat-panel">
        <header className="chat-head"><div className="chat-person"><Avatar name={selectedThread} size="md" /><div><strong>{people.find((p) => p.name === selectedThread)?.label ?? "Чат"}</strong><span>{selectedThread === "lena" ? "сейчас в сети" : "была недавно"}</span></div></div><div className="chat-actions"><IconButton label="Поиск"><Search size={17} /></IconButton><IconButton label="Ещё"><MoreHorizontal size={18} /></IconButton></div></header>
        <div className="chat-context"><span className="context-icon"><Sparkles size={14} /></span><span><strong>visual continuity</strong> сохранён · сцена «после дождя»</span><button type="button">открыть</button></div>
        <div className="chat-scroll">
          <div className="chat-date">СЕГОДНЯ</div>
          {messages.map((item, index) => (
            <div className={`bubble-row ${item.from === "me" ? "mine" : ""}`} key={index}>
              {item.from === "them" ? <Avatar name={selectedThread} size="sm" /> : null}
              <div className={`bubble ${item.from === "me" ? "bubble-mine" : ""}`}><p>{item.text}</p><span>{item.time}</span></div>
            </div>
          ))}
          <div className="photo-bubble"><div className="chat-art" style={artwork[1]}><span>continuation / 01</span></div><div className="photo-bubble-meta"><button type="button"><Heart size={16} /> сохранить в Vault</button><button type="button"><ArrowUpRight size={16} /> открыть</button></div></div>
        </div>
        <div className="composer"><IconButton label="Прикрепить"><Paperclip size={18} /></IconButton><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="сообщение…" onKeyDown={(e) => e.key === "Enter" && onSend()} /><button type="button" className="send-button" aria-label="Отправить" onClick={onSend}><Send size={17} /></button></div>
      </section>
    </div>
  );
}

function Imagine({ prompt, setPrompt, generated, onGenerate }: { prompt: string; setPrompt: (v: string) => void; generated: boolean; onGenerate: () => void }) {
  const chips = ["селфи", "кадр со стороны", "зеркало", "POV", "raw smartphone"];
  return (
    <div className="page-stack">
      <div className="imagine-shell">
        <section className="imagine-canvas">
          <div className="canvas-grid" />
          <div className="canvas-copy"><Pill active>SCENE / 04</Pill><h2>Продолжить<br /><i>как будто этого не было.</i></h2><p>Сцена уже знает место, свет, одежду и настроение. Меняй только то, что действительно хочешь.</p></div>
          <div className="canvas-image" style={generated ? artwork[3] : artwork[2]}>
            {generated ? <span className="generated-stamp"><Sparkles size={14} /> generated just now</span> : <span className="canvas-hint"><ImagePlus size={16} /> preview</span>}
          </div>
          <div className="canvas-footer"><span>identity / stable</span><span>light / warm dusk</span><span>camera / handheld</span><span>scene / after rain</span></div>
        </section>

        <aside className="imagine-controls">
          <div className="control-head"><span className="eyebrow">PROMPT EDITOR</span><IconButton label="Случайный вариант"><Zap size={17} /></IconButton></div>
          <label>Сценарий</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <div className="chip-row">{chips.map((chip) => <button type="button" key={chip} onClick={() => setPrompt((value) => `${value}, ${chip}`)}>{chip}</button>)}</div>
          <div className="control-section"><span className="mini-label">PRESERVE</span><div className="preserve-row"><span>identity</span><b>100%</b></div><div className="preserve-row"><span>scene</span><b>94%</b></div><div className="preserve-row"><span>light</span><b>88%</b></div></div>
          <div className="control-section"><span className="mini-label">ACTION</span><button type="button" className="primary-button wide" onClick={onGenerate}><Wand2 size={17} /> {generated ? "собрать ещё вариант" : "сгенерировать кадр"}</button><p className="helper">Обычный чат не вызывает генерацию. Здесь — только явное действие.</p></div>
        </aside>
      </div>
    </div>
  );
}

function Vault({ filter, setFilter }: { filter: "all" | "feed" | "imagine" | "chat"; setFilter: (v: "all" | "feed" | "imagine" | "chat") => void }) {
  const shown = filter === "all" ? files : files.filter((item) => item.tag === filter);
  return (
    <div className="page-stack">
      <section className="vault-hero">
        <div><span className="eyebrow">PRIVATE STORAGE</span><h2>Vault — без папочного ада.</h2><p>Dropbox остаётся инфраструктурой. Для пользователя это один визуальный архив мира Шторы.</p></div>
        <div className="vault-stat"><strong>28.6</strong><span>GB</span><div className="storage-bar"><i style={{ width: "68%" }} /></div><small>68% из 42 GB</small></div>
      </section>
      <div className="vault-toolbar"><div className="filter-pills">{(["all", "feed", "imagine", "chat"] as const).map((item) => <button type="button" key={item} className={`vault-filter ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item === "all" ? "всё" : item}</button>)}</div><button type="button" className="soft-button"><Plus size={16} /> загрузить</button></div>
      <section className="vault-grid">
        {shown.map((file) => (
          <article className="file-card" key={file.name}>
            {file.style ? <div className="file-art" style={file.style}><span>{file.tag}</span></div> : <div className="file-art file-doc"><FileImage size={28} /><span>AUDIO</span></div>}
            <div className="file-info"><div><strong>{file.name}</strong><span>{file.meta}</span></div><IconButton label="Больше"><MoreHorizontal size={17} /></IconButton></div>
          </article>
        ))}
      </section>
    </div>
  );
}

function Journal({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <div className="page-stack">
      <section className="journal-intro">
        <div><span className="eyebrow">NEW PAGE / VISUAL MEMORY</span><h2>Journal</h2><p>Новый слой продукта: не просто архив файлов, а последовательность моментов. Здесь видно, как одна сцена развивается от сообщения к фото и дальше.</p></div>
        <button type="button" className="primary-button" onClick={() => onNavigate("imagine")}><Sparkles size={16} /> открыть сцену</button>
      </section>
      <section className="timeline">
        {journal.map((item, index) => (
          <article className="timeline-row" key={item.title}>
            <div className="timeline-time"><span>{item.day}</span><small>0{index + 1}</small></div>
            <div className="timeline-line"><i /></div>
            <button type="button" className="timeline-card" onClick={() => onNavigate(index === 0 ? "messages" : "feed")}>
              <div className="timeline-art" style={item.style}><span>{item.mood}</span></div>
              <div className="timeline-copy"><span className="mini-label">SCENE MEMORY</span><h3>{item.title}</h3><p>{item.meta}</p><span className="text-button">открыть цепочку <ChevronRight size={15} /></span></div>
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
