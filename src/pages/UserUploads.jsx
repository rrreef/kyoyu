import { useState, useRef, useEffect } from 'react';
import { Upload as UploadIcon, Music2, File, X, Play, Pause, Trash2, ChevronLeft, ChevronRight, ChevronDown, Check, Image, Lock, AlertCircle } from 'lucide-react';
import * as mm from 'music-metadata-browser';
import InlinePlayer from '../components/player/InlinePlayer';
import './UserUploads.css';

/* ─── helpers ───────────────────────────────────────────────── */
const ACCEPTED = ['.wav','.aiff','.aif','.mp3','.flac'];
const fmtBytes = b => b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB';
const ext      = f => f.name.split('.').pop().toUpperCase();
const stripExt = n => n.replace(/\.[^/.]+$/,'');
const ok       = f => ACCEPTED.includes('.'+f.name.split('.').pop().toLowerCase());
const emptyMeta= id => ({ id, title:'', artist:'', album:'', genre:'', year:String(new Date().getFullYear()), label:'', mixEng:'', masterEng:'', artworkUrl:null, artworkFile:null });

/* ─── metadata extraction via music-metadata-browser ────────── */
async function extractMeta(file) {
  const r = { title:null, artist:null, album:null, genre:null, year:null, label:null, artworkUrl:null };
  try {
    const meta = await mm.parseBlob(file, { skipCovers: false, duration: false });
    const c = meta.common;
    r.title  = c.title              || null;
    r.artist = c.artist             || null;
    r.album  = c.album              || null;
    r.genre  = c.genre?.[0]         || null;
    r.year   = c.year?.toString()   || null;
    r.label  = c.label?.[0]         || null;
    if (c.picture?.length) {
      const pic = c.picture[0];
      r.artworkUrl = URL.createObjectURL(new Blob([pic.data], { type: pic.format || 'image/jpeg' }));
    }
  } catch (e) {
    console.warn('[UserUploads] metadata parse error:', e);
  }
  return r;
}

const STEPS = ['Files','Track Info','Review'];

export default function UserUploads() {
  const [step,        setStep]        = useState(0);
  const [files,       setFiles]       = useState([]);   // [{file,id}]
  const [metas,       setMetas]       = useState([]);
  const [active,      setActive]      = useState(0);
  const [saved,       setSaved]       = useState([]);
  const [playing,     setPlaying]     = useState(null);
  const [dragging,    setDragging]    = useState(false);
  const [rejected,    setRejected]    = useState([]);
  const [advanced,    setAdvanced]    = useState(false);
  const [audioUrls,   setAudioUrls]   = useState({});
  const fileRef    = useRef();
  const artRefs    = useRef([]);
  const audioRef   = useRef(new Audio());

  /* blob URLs */
  useEffect(() => {
    setAudioUrls(prev => {
      const next={...prev};
      const ids=new Set(files.map(f=>f.id));
      Object.keys(next).forEach(id=>{if(!ids.has(id)){URL.revokeObjectURL(next[id]);delete next[id];}});
      files.forEach(({file,id})=>{if(!next[id])next[id]=URL.createObjectURL(file);});
      return next;
    });
  },[files]);

  /* sync metas + extract tags for new files */
  useEffect(() => {
    const prev=new Map(metas.map(m=>[m.id,m]));
    const next=files.map(({file,id})=>prev.get(id)??{...emptyMeta(id),title:stripExt(file.name)});
    if(active>=files.length&&files.length>0)setActive(files.length-1);
    setMetas(next);
    files.forEach(({file,id})=>{
      if(prev.has(id))return;
      extractMeta(file).then(r=>{
        setMetas(m=>m.map(t=>t.id!==id?t:{...t,
          title:r.title||t.title, artist:r.artist||t.artist,
          album:r.album||t.album, genre:r.genre||t.genre,
          year:r.year||t.year,   label:r.label||t.label,
          artworkUrl:t.artworkUrl||r.artworkUrl||null,
        }));
      });
    });
  },[files]);

  function addFiles(fl) {
    const incoming=Array.from(fl);
    const good=incoming.filter(f=>ok(f));
    const bad=incoming.filter(f=>!ok(f));
    setFiles(prev=>{const names=new Set(prev.map(f=>f.file.name));return[...prev,...good.filter(f=>!names.has(f.name)).map(f=>({file:f,id:Math.random().toString(36).slice(2)}))];});
    if(bad.length){setRejected(bad.map(f=>f.name));setTimeout(()=>setRejected([]),4000);}
  }
  function removeFile(id){setFiles(p=>p.filter(f=>f.id!==id));}
  function setField(i,k){return v=>setMetas(m=>m.map((t,j)=>j===i?{...t,[k]:v}:t));}
  function copyAll(k,v){setMetas(m=>m.map(t=>({...t,[k]:v})));}
  function pickArt(i,e){const f=e.target.files[0];if(!f)return;const url=URL.createObjectURL(f);setMetas(m=>m.map((t,j)=>j===i?{...t,artworkFile:f,artworkUrl:url}:t));e.target.value='';}
  function rmArt(i){setMetas(m=>m.map((t,j)=>j===i?{...t,artworkFile:null,artworkUrl:null}:t));}

  function saveAll(){
    setSaved(prev=>[...metas.map((m,i)=>({...m,fileUrl:audioUrls[files[i]?.id],format:ext(files[i].file),size:fmtBytes(files[i].file.size)})),...prev]);
    setFiles([]);setMetas([]);setStep(0);setActive(0);
  }
  function removeSaved(id){setSaved(p=>p.filter(t=>t.id!==id));if(playing===id){audioRef.current.pause();setPlaying(null);}}
  function togglePlay(t){if(playing===t.id){audioRef.current.pause();setPlaying(null);}else{audioRef.current.src=t.fileUrl;audioRef.current.play();setPlaying(t.id);audioRef.current.onended=()=>setPlaying(null);}}

  const m=metas[active]||emptyMeta('_');

  /* ── STEP 0 ─────────────────────────────────────────── */
  if(step===0) return (
    <div className="page uu-page animate-in">
      <div className="uu-header"><h1>My Uploads</h1></div>
      <div className="uu-steps">{STEPS.map((s,i)=><div key={s} className={`uu-step${i===step?' active':i<step?' done':''}`}><span>{i<step?'✓':i+1}</span>{s}</div>)}</div>

      <input ref={fileRef} type="file" multiple accept=".wav,.aiff,.aif,.mp3,.flac" style={{display:'none'}} onChange={e=>{addFiles(e.target.files);e.target.value='';}}/>

      <div className={`uu-dropzone glass${dragging?' dragging':''}`}
        onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);addFiles(e.dataTransfer.files);}}
        onClick={()=>fileRef.current.click()}>
        <UploadIcon size={28} strokeWidth={1.5}/>
        <div className="uu-drop-title">{dragging?'Drop to add':'Drag & drop audio files'}</div>
        <div className="uu-drop-formats">{['FLAC','WAV','AIFF','MP3'].map(f=><span key={f} className="uu-fmt">{f}</span>)}</div>
      </div>

      {rejected.length>0&&<div className="uu-rejected"><AlertCircle size={13}/><span>{rejected.join(', ')} — unsupported format</span></div>}

      {files.length>0&&(
        <div className="uu-file-list glass">
          <div className="uu-file-list-hdr"><span>{files.length} track{files.length>1?'s':''} selected</span><button onClick={()=>fileRef.current.click()}>+ Add more</button></div>
          {files.map(({file,id},i)=>(
            <div key={id} className="uu-file-row">
              <span className="uu-file-num">{i+1}</span>
              <File size={13}/><span className="uu-file-name">{file.name}</span>
              <span className="uu-fmt">{ext(file)}</span><span className="uu-fsz">{fmtBytes(file.size)}</span>
              <button onClick={()=>removeFile(id)}><X size={13}/></button>
            </div>
          ))}
        </div>
      )}

      <div className="uu-privacy"><Lock size={11}/><span>Stored privately · never uploaded to servers</span></div>

      {files.length>0&&<button className="uu-next-btn" onClick={()=>setStep(1)}>Next — Track Info <ChevronRight size={15}/></button>}

      {saved.length>0&&(
        <div className="uu-library">
          <div className="uu-library-hdr">Library</div>
          {saved.map(t=>(
            <div key={t.id} className={`uu-track glass${playing===t.id?' playing':''}`}>
              {t.artworkUrl?<img src={t.artworkUrl} alt="" className="uu-art"/>:<div className="uu-art-ph"><Music2 size={15}/></div>}
              <div className="uu-track-info"><div className="uu-track-title">{t.title}</div><div className="uu-track-sub">{[t.artist,t.format,t.size].filter(Boolean).join(' · ')}</div></div>
              <button className="uu-play" onClick={()=>togglePlay(t)}>{playing===t.id?<Pause size={14} fill="currentColor"/>:<Play size={14} fill="currentColor"/>}</button>
              <button className="uu-del" onClick={()=>removeSaved(t.id)}><Trash2 size={13}/></button>
            </div>
          ))}
        </div>
      )}

      {saved.length===0&&files.length===0&&<div className="uu-empty"><Music2 size={32} strokeWidth={1.2}/><div>No uploads yet</div><div className="uu-empty-sub">Your private music lives here</div></div>}
    </div>
  );

  /* ── STEP 1: Track Info ──────────────────────────────── */
  if(step===1) return (
    <div className="page uu-page animate-in">
      <div className="uu-header">
        <button className="uu-back-btn" onClick={()=>setStep(0)}><ChevronLeft size={18}/></button>
        <h1>Track Info</h1>
        <button className="uu-next-sm" onClick={()=>setStep(2)}>Review <ChevronRight size={14}/></button>
      </div>
      <div className="uu-steps">{STEPS.map((s,i)=><div key={s} className={`uu-step${i===step?' active':i<step?' done':''}`}><span>{i<step?'✓':i+1}</span>{s}</div>)}</div>

      {files.length>1&&(
        <div className="uu-tabs">
          {files.map(({file,id},i)=>(
            <button key={id} className={`uu-tab${i===active?' active':''}`} onClick={()=>setActive(i)}>
              {metas[i]?.artworkUrl?<img src={metas[i].artworkUrl} alt="" className="uu-tab-art"/>:<span className="uu-tab-num">{i+1}</span>}
              <span>{metas[i]?.title||stripExt(file.name)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="uu-track-form">
        {/* Artwork */}
        <input type="file" accept="image/*" style={{display:'none'}} ref={el=>artRefs.current[active]=el} onChange={e=>pickArt(active,e)}/>
        <div className="uu-art-section">
          {m.artworkUrl?(
            <div className="uu-art-preview">
              <img src={m.artworkUrl} alt="artwork" className="uu-art-big"/>
              <div className="uu-art-btns">
                <button onClick={()=>artRefs.current[active]?.click()}>Replace</button>
                <button onClick={()=>rmArt(active)}><X size={12}/></button>
              </div>
            </div>
          ):(
            <div className="uu-art-empty" onClick={()=>artRefs.current[active]?.click()}>
              <Image size={24} strokeWidth={1.5}/><span>Add artwork</span><span className="uu-art-hint">JPG, PNG · min 800×800</span>
            </div>
          )}
          <div className="uu-file-chip"><File size={11}/>{files[active]?.file.name}<span className="uu-fmt">{ext(files[active]?.file??{name:'x.mp3'})}</span></div>
          <InlinePlayer
            src={audioUrls[files[active]?.id]}
            artworkUrl={m.artworkUrl}
            title={m.title}
            artist={m.artist}
            hasPrev={active > 0}
            hasNext={active < files.length - 1}
            onPrev={() => setActive(a => Math.max(0, a - 1))}
            onNext={() => setActive(a => Math.min(files.length - 1, a + 1))}
          />
        </div>

        {/* Fields */}
        <div className="uu-fields glass">
          {[
            {k:'title',  label:'Title'},
            {k:'artist', label:'Artist', copy:true},
            {k:'album',  label:'Album',  copy:true},
            {k:'genre',  label:'Genre',  copy:true},
            {k:'year',   label:'Year',   copy:true, type:'number'},
          ].map(({k,label,copy,type})=>(
            <div key={k} className="uu-field">
              <label>{label}{copy&&files.length>1&&<button className="uu-copy-all" onClick={()=>copyAll(k,m[k])}>Copy to all</button>}</label>
              <input type={type||'text'} value={m[k]||''} onChange={e=>setField(active,k)(e.target.value)} placeholder={label}/>
            </div>
          ))}
        </div>

        {/* Advanced */}
        <button className="uu-adv-toggle" onClick={()=>setAdvanced(a=>!a)}>
          <ChevronDown size={14} className={`uu-chev${advanced?' open':''}`}/> Advanced
        </button>
        {advanced&&(
          <div className="uu-fields glass uu-fields-adv animate-in">
            {[{k:'mixEng',label:'Mixing Engineer'},{k:'masterEng',label:'Mastering Engineer'},{k:'label',label:'Label',copy:true}].map(({k,label,copy})=>(
              <div key={k} className="uu-field">
                <label>{label}{copy&&files.length>1&&<button className="uu-copy-all" onClick={()=>copyAll(k,m[k])}>Copy to all</button>}</label>
                <input value={m[k]||''} onChange={e=>setField(active,k)(e.target.value)} placeholder={label}/>
              </div>
            ))}
          </div>
        )}

        {files.length>1&&(
          <div className="uu-track-nav">
            <button disabled={active===0} onClick={()=>setActive(i=>i-1)}><ChevronLeft size={14}/> Prev</button>
            <span>{active+1} / {files.length}</span>
            <button disabled={active===files.length-1} onClick={()=>setActive(i=>i+1)}>Next <ChevronRight size={14}/></button>
          </div>
        )}
      </div>
    </div>
  );

  /* ── STEP 2: Review ──────────────────────────────────── */
  return (
    <div className="page uu-page animate-in">
      <div className="uu-header">
        <button className="uu-back-btn" onClick={()=>setStep(1)}><ChevronLeft size={18}/></button>
        <h1>Review</h1>
        <button className="uu-save-hdr" onClick={saveAll}><Check size={14}/> Save All</button>
      </div>
      <div className="uu-steps">{STEPS.map((s,i)=><div key={s} className={`uu-step${i===step?' active':i<step?' done':''}`}><span>{i<step?'✓':i+1}</span>{s}</div>)}</div>

      <div className="uu-review-list">
        {metas.map((t,i)=>(
          <div key={t.id} className="uu-review-card glass">
            {t.artworkUrl?<img src={t.artworkUrl} alt="" className="uu-review-art"/>:<div className="uu-review-art uu-art-ph"><Music2 size={20}/></div>}
            <div className="uu-review-info">
              <div className="uu-review-title">{t.title||'Untitled'}</div>
              <div className="uu-review-sub">{t.artist}{t.album?' — '+t.album:''}</div>
              <div className="uu-review-tags">{[t.genre,t.year,ext(files[i].file)].filter(Boolean).map(v=><span key={v} className="uu-fmt">{v}</span>)}</div>
            </div>
            <button className="uu-review-edit" onClick={()=>{setActive(i);setStep(1);}}><ChevronRight size={16}/></button>
          </div>
        ))}
      </div>

      <button className="uu-save-full" onClick={saveAll}><Check size={18}/> Save {files.length} Track{files.length>1?'s':''} to Library</button>
    </div>
  );
}
