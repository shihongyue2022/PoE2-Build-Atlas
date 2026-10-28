param([string]$Install, [string]$Script, [string]$Request, [string]$Response, [string]$Wrapper)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PobLuaProbe {
 [DllImport("kernel32",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool SetDllDirectory(string path);
 [DllImport("lua51",CallingConvention=CallingConvention.Cdecl)] static extern IntPtr luaL_newstate();
 [DllImport("lua51",CallingConvention=CallingConvention.Cdecl)] static extern void luaL_openlibs(IntPtr state);
 [DllImport("lua51",CallingConvention=CallingConvention.Cdecl)] static extern int luaL_loadfile(IntPtr state,string file);
 [DllImport("lua51",CallingConvention=CallingConvention.Cdecl)] static extern int lua_pcall(IntPtr state,int args,int results,int handler);
 [DllImport("lua51",CallingConvention=CallingConvention.Cdecl)] static extern IntPtr lua_tolstring(IntPtr state,int index,out UIntPtr length);
 [DllImport("lua51",CallingConvention=CallingConvention.Cdecl)] static extern void lua_close(IntPtr state);
 [DllImport("lua51",CallingConvention=CallingConvention.Cdecl)] static extern void lua_pushlstring(IntPtr state,byte[] bytes,UIntPtr length);
 [DllImport("lua51",CallingConvention=CallingConvention.Cdecl)] static extern void lua_setfield(IntPtr state,int index,string name);
 static void Set(IntPtr state,string name,string value) { byte[] bytes=System.Text.Encoding.UTF8.GetBytes(value); lua_pushlstring(state,bytes,(UIntPtr)bytes.Length); lua_setfield(state,-10002,name); }
 public static void Run(string folder,string file,string request,string response,string wrapper) {
  if(!SetDllDirectory(folder)) throw new Exception("DLL directory unavailable");
  System.IO.Directory.SetCurrentDirectory(folder);
  var state=luaL_newstate(); if(state==IntPtr.Zero) throw new Exception("Lua state unavailable");
  try { luaL_openlibs(state); Set(state,"WB_REQUEST",request); Set(state,"WB_RESPONSE",response); Set(state,"WB_WRAPPER",wrapper); int code=luaL_loadfile(state,file); if(code==0) code=lua_pcall(state,0,0,0); if(code!=0) { UIntPtr n; IntPtr ptr=lua_tolstring(state,-1,out n); byte[] bytes=new byte[(int)n.ToUInt64()]; Marshal.Copy(ptr,bytes,0,bytes.Length); throw new Exception(System.Text.Encoding.UTF8.GetString(bytes)); } }
  finally { lua_close(state); }
 }
}
'@
[PobLuaProbe]::Run($Install,$Script,$Request,$Response,$Wrapper)
