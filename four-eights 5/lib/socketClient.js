// lib/socketClient.js
// Thin wrapper around socket.io-client used by React components.

import { io } from 'socket.io-client';

let _socket = null;

export function getSocket() {
  if (_socket) return _socket;
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || '';
  _socket = io(url, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
  });
  return _socket;
}

export function emitWithAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response) => resolve(response));
  });
}
