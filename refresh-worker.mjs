import {loadData} from './data.mjs?v=9';
loadData().then(
 result=>postMessage({ok:true,result}),
 ()=>postMessage({ok:false})
);
