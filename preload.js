const { contextBridge, ipcRenderer: ipc } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipc.invoke('load'), save: c => ipc.invoke('save', c),
  sounds: () => ipc.invoke('sounds'), addSound: () => ipc.invoke('addSound'),
  importRows: () => ipc.invoke('importRows'), template: (r, n) => ipc.invoke('template', r, n),
  autostart: on => ipc.invoke('autostart', on), sleepBlock: on => ipc.invoke('sleepBlock', on),
  remoteSet: on => ipc.invoke('remoteSet', on), remoteInfo: () => ipc.invoke('remoteInfo'),
  onRemote: cb => ipc.on('remote', (e, a, id) => cb(a, id)), ack: (id, ok, msg) => ipc.send('ack', id, ok, msg), status: t => ipc.send('status', t),
  tgSet: () => ipc.invoke('tgSet'), tgInfo: () => ipc.invoke('tgInfo'), tgReset: () => ipc.invoke('tgReset'),
  backup: c => ipc.invoke('backup', c), restore: () => ipc.invoke('restore')
});
