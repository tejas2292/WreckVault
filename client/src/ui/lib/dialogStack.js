// Tracks open dialogs so only the top one reacts to Escape, and global shortcuts stay quiet
// while any dialog is open.
const stack = [];
let seq = 0;

export function pushDialog() {
  const token = ++seq;
  stack.push(token);
  return token;
}

export function popDialog(token) {
  const i = stack.lastIndexOf(token);
  if (i >= 0) stack.splice(i, 1);
}

export function isTopDialog(token) {
  return stack[stack.length - 1] === token;
}

export function anyDialogOpen() {
  return stack.length > 0;
}
