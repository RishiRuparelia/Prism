(()=>{
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
 const s=read('prism.settings',{});
 if(s.title)document.title=s.title;
 if(s.motion===false){const style=document.createElement('style');style.textContent='*,*::before,*::after{animation:none!important;transition:none!important}.block-row{opacity:1!important}#prism-spectrum{opacity:1!important}';document.head.append(style);}
 if(s.accent)document.documentElement.style.setProperty('--gold',s.accent);
 if(s.background===false)document.querySelector('#scene')?.setAttribute('hidden','');
 const links=document.querySelector('.quick-links');
 if(links){links.hidden=!read('prism_quick_links',true);if(links.hidden)links.style.display='none';for(const link of read('prism_quick_link_details',[])){if(!link||typeof link.url!=='string'||!/^https?:\/\//i.test(link.url))continue;const button=document.createElement('button');button.className='quick-link';button.textContent=String(link.name||link.url);button.onclick=()=>window.openOverlay?.(link.url);links.append(button);}links.querySelectorAll('span.quick-link').forEach(el=>{el.setAttribute('role','button');el.tabIndex=0;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};});}
 const originalTitle=document.title,icon=document.querySelector('link[rel=icon]'),originalIcon=icon?.href;
 document.addEventListener('visibilitychange',()=>{if(!read('prism_auto_cloak',false))return;if(document.hidden){document.title=localStorage.getItem('prism_tab_title')||originalTitle;const custom=localStorage.getItem('prism_tab_icon');if(icon&&custom&&/^https?:\/\//i.test(custom))icon.href=custom;}else{document.title=originalTitle;if(icon&&originalIcon)icon.href=originalIcon;}});
 window.addEventListener('beforeunload',e=>{if(read('prism_anti_close',false)){e.preventDefault();e.returnValue='';}});
 if(!location.pathname.endsWith('settings.html'))document.addEventListener('keydown',e=>{const p=read('prism_panic',null),c=p?.combo;if(!c||!/^https?:\/\//i.test(p.url))return;const k=e.key===' '?'SPACE':e.key.toUpperCase();if(k===c.key&&e.ctrlKey===c.ctrl&&e.altKey===c.alt&&e.shiftKey===c.shift&&e.metaKey===c.meta){e.preventDefault();location.assign(p.url);}});
 const overlay=document.querySelector('#proxy-overlay');if(overlay){overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Prism browser');overlay.setAttribute('aria-modal','true');}
})();
