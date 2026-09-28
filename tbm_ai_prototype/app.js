
function toast(msg){const el=document.getElementById('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1800)}

document.querySelectorAll('.flow-node[data-node]').forEach(n=>n.addEventListener('click',()=>{document.querySelectorAll('.flow-node').forEach(x=>x.classList.remove('selected'));n.classList.add('selected');const t=document.getElementById('detailTitle');if(t)t.textContent=n.dataset.node;toast('已选择节点：'+n.dataset.node)}));
document.querySelectorAll('.agent-card').forEach(n=>n.addEventListener('click',()=>{document.querySelectorAll('.agent-card').forEach(x=>x.classList.remove('selected'));n.classList.add('selected');const t=document.getElementById('agentDetailTitle');if(t)t.textContent=n.dataset.agent;toast('已切换 Agent：'+n.dataset.agent)}));
const start=document.getElementById('startRun'); if(start)start.addEventListener('click',()=>{start.textContent='✓ 协同分析已启动';toast('已创建新的多智能体协同任务')});
const save=document.getElementById('saveSettings'); if(save)save.addEventListener('click',()=>toast('设置已保存'));
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{const p=b.parentElement; p.querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active')}));
document.querySelectorAll('.segmented button').forEach(b=>b.addEventListener('click',()=>{b.parentElement.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on')}));
