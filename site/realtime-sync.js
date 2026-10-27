/* Firebase subscriptions recover after terminal stream errors and browser suspension.
   A bounded Pátio server check complements live events after browser suspension. */
(function(root){
  'use strict';
  function create({subscribe,win=root,doc=root.document,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,canResume=()=>true,readServer=null,isCritical=ref=>/\/patio$/.test(ref?.path||''),getScope=()=>'',report=error=>console.warn('Sincronização do painel:',error)}){
    const streams=new Set();let hiddenAt=null,offline=false,lastResume=-Infinity,watchdog=null;
    const safe=fn=>(...args)=>{try{Promise.resolve(fn?.(...args)).catch(report);}catch(error){report(error);}};
    function watch(...args){
      const index=typeof args[1]==='function'?1:2;
      if(typeof args[index]!=='function')throw new TypeError('Snapshot callback required');
      const next=args[index],error=args[index+1],scope=getScope();
      const state={closed:false,unsub:null,timer:null,attempt:0,generation:0,failed:false,scope,revision:0,probing:false,probeAt:-Infinity,pendingWrites:false,ref:args[0]};streams.add(state);
      const valid=()=>!state.closed&&state.scope===getScope();
      function stop(){state.generation++;clearTimer(state.timer);state.timer=null;state.unsub?.();state.unsub=null;}
      function failed(err){
        if(!valid())return;stop();state.failed=true;safe(error||report)(err);
        // Invalid queries and denied access need an external recovery event; never loop them.
        if(['permission-denied','unauthenticated','invalid-argument','failed-precondition','unimplemented'].includes(err?.code))return;
        const delay=Math.min(60000,2000*2**Math.min(state.attempt++,5));
        state.timer=setTimer(()=>{state.timer=null;if(valid()&&canResume()&&!doc?.hidden&&win.navigator?.onLine!==false)start();},delay);
      }
      function start(){
        if(!valid())return;stop();state.failed=false;const generation=state.generation;
        const callbacks=args.slice(0,index);
        if(readServer&&isCritical(state.ref)){
          if(index===1)callbacks.push({includeMetadataChanges:true});
          else callbacks[1]={...callbacks[1],includeMetadataChanges:true};
        }
        callbacks.push(snapshot=>{if(!valid()||generation!==state.generation)return;state.revision++;state.pendingWrites=!!snapshot.metadata?.hasPendingWrites;state.attempt=0;state.failed=false;safe(next)(snapshot);},err=>{if(generation===state.generation)failed(err);});
        try{const unsub=subscribe(...callbacks);if(generation===state.generation)state.unsub=unsub;else unsub?.();}catch(err){failed(err);}
      }
      state.probe=async()=>{
        if(!readServer||!valid()||!canResume()||doc?.hidden||win.navigator?.onLine===false||state.probing||state.pendingWrites||now()-state.probeAt<15000)return;
        state.probing=true;state.probeAt=now();const revision=state.revision,generation=state.generation;
        try{const snapshot=await readServer(state.ref);if(valid()&&canResume()&&generation===state.generation&&revision===state.revision&&!state.pendingWrites){state.revision++;safe(next)(snapshot);}}
        catch(error){report(error);}finally{state.probing=false;}
      };
      state.restart=start;start();armWatchdog();
      return ()=>{state.closed=true;stop();streams.delete(state);if(![...streams].some(s=>isCritical(s.ref))){clearTimer(watchdog);watchdog=null;}};
    }
    function probeCritical(){for(const state of streams)if(isCritical(state.ref)&&state.scope===getScope())state.probe();}
    function armWatchdog(){
      if(!readServer||watchdog||![...streams].some(s=>isCritical(s.ref)))return;
      watchdog=setTimer(()=>{watchdog=null;probeCritical();armWatchdog();},60000);
    }
    function resume(all=false){
      if(!canResume()||doc?.hidden||win.navigator?.onLine===false)return;
      if(all&&now()-lastResume<30000)all=false;
      if(all)lastResume=now();
      for(const state of streams)if(!state.closed&&state.scope===getScope()&&((all&&!readServer)||state.failed))state.restart();
      if(readServer)probeCritical();
    }
    doc?.addEventListener('visibilitychange',()=>{if(doc.hidden)hiddenAt=now();else{const suspended=hiddenAt!==null&&now()-hiddenAt>=60000;hiddenAt=null;resume(suspended);}});
    win.addEventListener?.('offline',()=>{offline=true;});
    win.addEventListener?.('online',()=>{const wasOffline=offline;offline=false;resume(wasOffline);});
    win.addEventListener?.('focus',()=>resume());
    win.addEventListener?.('pageshow',event=>resume(event.persisted===true));
    // Called only after the app approves login. Keep existing query references in the
    // same unit, but bind their callbacks to the newly approved account.
    function reauthorize(){
      if(!canResume())return;
      const scope=getScope(),unit=scope.split('|')[0];
      for(const state of streams)if(!state.closed&&state.scope.split('|')[0]===unit){
        if(state.scope!==scope){state.scope=scope;state.restart();}
        else if(state.failed)state.restart();
      }
    }
    return {watch,resume,reauthorize};
  }
  root.HeilogRealtime={create};
})(typeof window==='undefined'?globalThis:window);
