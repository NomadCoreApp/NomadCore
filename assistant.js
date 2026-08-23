/* ============================================================
 * NomadCore — AI assistant widget (floating chat)
 * Self-contained; talks to the nc-assistant Edge Function. Reads
 * window.NC_CONFIG (from assistant-config.js). Drop assistant-config.js +
 * this file before </body> on any page.
 *
 * Agent Build Standard controls on the client:
 *   SCOPE-02 (discloses it's AI), OUT-01 (escape + link-destination allowlist),
 *   SEC-06 (echoes the server's signed assistant turns), PRIV-03 (storage
 *   notice + deletion path), SEC-05 (sends a Turnstile token when configured).
 * ============================================================ */
(function () {
  "use strict";
  if (window.__ncAssistant) return;
  window.__ncAssistant = true;

  var CFG = window.NC_CONFIG || {};
  var ENDPOINT = CFG.ASSISTANT_FN || "";
  var CONFIGURED = ENDPOINT && ENDPOINT.indexOf("REPLACE_ME") === -1;
  var TS_SITEKEY = CFG.TURNSTILE_SITEKEY || ""; // SEC-05: set to activate Turnstile
  var CONTACT = CFG.CONTACT_EMAIL || "support@nomad-core.com";
  var history = [];
  var busy = false;

  // OUT-01: only these hosts become clickable absolute links; anything else the
  // model emits stays inert escaped text (no first-party phishing via a hallucinated URL).
  var LINK_HOSTS = ["nomad-core.com", "www.nomad-core.com", "apps.apple.com", "play.google.com", "lostpinescreative.com"];

  var css = "\
.nca-launch{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:58px;height:58px;border:none;border-radius:50%;\
background:linear-gradient(135deg,#2E6BD6,#22B8CF);color:#fff;cursor:pointer;box-shadow:0 8px 26px -8px rgba(46,107,214,.7);\
display:flex;align-items:center;justify-content:center;transition:transform .2s ease}\
.nca-launch:hover{transform:translateY(-2px) scale(1.03)}.nca-launch svg{width:26px;height:26px}\
.nca-panel{position:fixed;right:20px;bottom:88px;z-index:2147483000;width:360px;max-width:calc(100vw - 32px);height:520px;\
max-height:calc(100vh - 120px);background:#0a1526;color:#e6eefb;border:1px solid #172f52;border-radius:16px;\
box-shadow:0 24px 60px -20px rgba(0,0,0,.7);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}\
.nca-panel.nca-open{display:flex;animation:nca-in .22s ease}\
@keyframes nca-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}\
.nca-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:linear-gradient(135deg,#2E6BD6,#22B8CF)}\
.nca-head b{font-size:1.05rem;color:#fff;flex:1;font-weight:700}.nca-head small{color:rgba(255,255,255,.85);font-size:.72rem;display:block;font-weight:500}\
.nca-x{background:none;border:none;color:#fff;font-size:1.4rem;line-height:1;cursor:pointer;opacity:.85;padding:0 2px}.nca-x:hover{opacity:1}\
.nca-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}\
.nca-msg{max-width:85%;padding:10px 13px;border-radius:14px;font-size:.9rem;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}\
.nca-bot{align-self:flex-start;background:#10233f;border:1px solid #1e3a5f;border-bottom-left-radius:4px}\
.nca-user{align-self:flex-end;background:linear-gradient(135deg,#2E6BD6,#22B8CF);color:#fff;border-bottom-right-radius:4px}\
.nca-msg a{color:#6fc2e8}.nca-user a{color:#fff;text-decoration:underline}\
.nca-msg strong{font-weight:700}.nca-msg code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85em;background:#0d1b30;border:1px solid #1e3a5f;padding:1px 5px;border-radius:4px}\
.nca-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:#10233f;border:1px solid #1e3a5f;border-radius:14px}\
.nca-typing span{width:7px;height:7px;border-radius:50%;background:#5a7196;animation:nca-blink 1.2s infinite}\
.nca-typing span:nth-child(2){animation-delay:.2s}.nca-typing span:nth-child(3){animation-delay:.4s}\
@keyframes nca-blink{0%,60%,100%{opacity:.3}30%{opacity:1}}\
.nca-form{display:flex;gap:8px;padding:12px 12px 8px;border-top:1px solid #172f52;background:#081120}\
.nca-form input{flex:1;background:#10233f;border:1px solid #1e3a5f;border-radius:10px;padding:10px 12px;color:#e6eefb;font-size:.9rem;font-family:inherit}\
.nca-form input:focus{outline:none;border-color:#2E6BD6}\
.nca-send{background:linear-gradient(135deg,#2E6BD6,#22B8CF);border:none;border-radius:10px;width:42px;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}\
.nca-send:disabled{opacity:.5}.nca-send svg{width:18px;height:18px}\
.nca-note{font-size:.66rem;line-height:1.4;color:#5a7196;text-align:center;padding:0 12px 10px;background:#081120}\
.nca-note a{color:#5a7196;text-decoration:underline}\
#nca-ts{position:absolute;left:-9999px;bottom:0}\
@media (prefers-reduced-motion:reduce){.nca-panel.nca-open,.nca-launch:hover{animation:none;transform:none}}";
  var style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  var launch = document.createElement("button");
  launch.className = "nca-launch"; launch.setAttribute("aria-label", "Open the NomadCore assistant");
  launch.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "nca-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "NomadCore assistant");
  panel.innerHTML =
    '<div class="nca-head"><div style="flex:1"><b>NomadCore Assistant</b><small>Virtual AI · not for emergencies — call 911</small></div>' +
    '<button class="nca-x" aria-label="Close">×</button></div>' +
    '<div class="nca-log" role="log" aria-live="polite"></div>' +
    '<form class="nca-form"><input type="text" placeholder="Ask about the app, your risk, getting ready…" aria-label="Message" autocomplete="off"/>' +
    '<button class="nca-send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></form>' +
    '<div class="nca-note">Virtual AI — replies may be imperfect, and this is not emergency or medical advice. In an emergency call 911. Chats may be stored so we can follow up; email <a href="mailto:' + esc(CONTACT) + '">' + esc(CONTACT) + '</a> to delete yours.</div>' +
    '<div id="nca-ts"></div>';

  document.body.appendChild(launch); document.body.appendChild(panel);
  var log = panel.querySelector(".nca-log"), form = panel.querySelector(".nca-form"),
      input = panel.querySelector(".nca-form input"), sendBtn = panel.querySelector(".nca-send"), opened = false;

  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  // OUT-01: an absolute link is emitted only for an allowlisted host; otherwise
  // the label survives as inert text (no first-party phishing via a made-up URL).
  function linkAbs(url,text){try{if(LINK_HOSTS.indexOf(new URL(url).host)>=0)return '<a href="'+url+'" target="_blank" rel="noopener">'+text+'</a>';}catch(e){}return text;}
  function render(t){
    var o=esc(t);
    // Markdown links [text](url): allowlisted absolute (new tab) or root-relative.
    o=o.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|\/[A-Za-z0-9/_.#?=&%-]*)\)/g,function(m,txt,url){
      return url.charAt(0)==="/" ? '<a href="'+url+'">'+txt+'</a>' : linkAbs(url,txt);
    });
    // Minimal markdown (input is already HTML-escaped): bold + inline code.
    o=o.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
    o=o.replace(/__([^_\n]+)__/g,'<strong>$1</strong>');
    o=o.replace(/`([^`\n]+)`/g,'<code>$1</code>');
    // Bare links — leading boundary so we never re-match inside an inserted tag.
    o=o.replace(/(^|\s)(https?:\/\/[^\s<]+)/g,function(m,pre,url){return pre+linkAbs(url,url);});
    o=o.replace(/(^|[\s(])(\/[a-zA-Z0-9/_.-]+)/g,'$1<a href="$2">$2</a>');
    o=o.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,'<a href="mailto:$1">$1</a>');
    return o;
  }
  function addMsg(role,t){var e=document.createElement("div");e.className="nca-msg "+(role==="user"?"nca-user":"nca-bot");e.innerHTML=render(t);log.appendChild(e);log.scrollTop=log.scrollHeight;}
  function typing(on){var ex=log.querySelector(".nca-typing");if(on&&!ex){var t=document.createElement("div");t.className="nca-typing";t.innerHTML="<span></span><span></span><span></span>";log.appendChild(t);log.scrollTop=log.scrollHeight;}else if(!on&&ex){ex.remove();}}

  // ── SEC-05: Cloudflare Turnstile (only when a sitekey is configured). ──
  var tsWidgetId = null, tsResolve = null;
  if (TS_SITEKEY) {
    window.__ncaTsCb = function () {
      try {
        tsWidgetId = window.turnstile.render("#nca-ts", {
          sitekey: TS_SITEKEY, size: "invisible",
          callback: function (tok) { if (tsResolve) { tsResolve(tok); tsResolve = null; } },
          "error-callback": function () { if (tsResolve) { tsResolve(""); tsResolve = null; } },
        });
      } catch (e) { /* noop */ }
    };
    var ts = document.createElement("script");
    ts.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__ncaTsCb&render=explicit";
    ts.async = true; ts.defer = true; document.head.appendChild(ts);
  }
  function getToken() {
    if (!TS_SITEKEY || tsWidgetId === null || !window.turnstile) return Promise.resolve("");
    return new Promise(function (res) {
      var done = false; var finish = function (v) { if (!done) { done = true; res(v); tsResolve = null; } };
      tsResolve = finish;
      try { window.turnstile.reset(tsWidgetId); window.turnstile.execute(tsWidgetId); } catch (e) { finish(""); }
      setTimeout(function () { finish(""); }, 8000); // degrade: no token -> server decides
    });
  }

  function open(){panel.classList.add("nca-open");launch.style.display="none";if(!opened){opened=true;addMsg("bot",CONFIGURED?"Hi! I'm NomadCore's virtual (AI) assistant. Ask me about the app, or I can point you to your local risk profile and help your family get ready. (In an emergency, call 911.)":"The assistant isn't switched on yet. Email "+CONTACT+" and we'll get right back to you.");}setTimeout(function(){input.focus();},60);}
  function close(){panel.classList.remove("nca-open");launch.style.display="flex";}
  launch.addEventListener("click",open);panel.querySelector(".nca-x").addEventListener("click",close);
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&panel.classList.contains("nca-open"))close();});

  form.addEventListener("submit",function(e){e.preventDefault();var text=input.value.trim();if(!text||busy)return;
    if(!CONFIGURED){input.value="";addMsg("user",text);addMsg("bot","I'm not connected yet — please email "+CONTACT+" for now.");return;}
    input.value="";addMsg("user",text);history.push({role:"user",content:text});send();});

  function send(){busy=true;sendBtn.disabled=true;typing(true);
    getToken().then(function(tsToken){
      return fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history,tsToken:tsToken})});
    })
      .then(function(r){return r.json().catch(function(){return {};});})
      // SEC-06: keep the server's signature so the next turn can prove this reply is real.
      .then(function(d){typing(false);var reply=(d&&d.reply)||"Sorry — I hit a snag. Reach us at "+CONTACT+".";addMsg("bot",reply);history.push({role:"assistant",content:reply,sig:(d&&d.sig)||undefined});})
      .catch(function(){typing(false);addMsg("bot","I couldn't connect just now. Please email "+CONTACT+".");})
      .finally(function(){busy=false;sendBtn.disabled=false;input.focus();});}
})();
