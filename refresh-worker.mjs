import {loadData} from './data.mjs?v=10';
loadData().then(
 result=>postMessage({ok:true,result}),
 ()=>postMessage({ok:false})
);
