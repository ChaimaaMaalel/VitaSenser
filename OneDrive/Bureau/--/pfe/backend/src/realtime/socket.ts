import type { Server } from 'socket.io';

let socketServer: Server | null = null;

export const setSocketServer = (io: Server) => {
  socketServer = io;
};

export const getSocketServer = (): Server | null => socketServer;

export const emitToRoom = (room: string, event: string, payload: unknown) => {
  if (!socketServer) return;
  socketServer.to(room).emit(event, payload);
};

export const emitGlobal = (event: string, payload: unknown) => {
  if (!socketServer) return;
  socketServer.emit(event, payload);
};
