/* Opens Google Maps externally. No API key and no automatic traffic collection. */
(function(root){
 const defaults={factory:'Heineken, Jacareí, SP, Brasil',lusitana:'Lusitana, Caçapava, SP, Brasil'};
 function route(points,direction='outbound'){const from=direction==='inbound'?points.lusitana:points.factory,to=direction==='inbound'?points.factory:points.lusitana;if(!from?.trim()||!to?.trim())throw Error('Informe os endereços das duas portarias.');const url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');url.searchParams.set('origin',from.trim());url.searchParams.set('destination',to.trim());url.searchParams.set('travelmode','driving');return url.href;}
 root.BaldeioMaps={defaults,route};
})(globalThis);
