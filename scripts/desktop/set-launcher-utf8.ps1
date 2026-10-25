param([Parameter(Mandatory = $true)][string]$Executable)
$ErrorActionPreference = 'Stop'
if (!('FigTide.NativeManifest' -as [type])) {
    Add-Type @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
namespace FigTide {
 public static class NativeManifest {
  delegate bool LanguageCallback(IntPtr module, IntPtr type, IntPtr name, ushort language, IntPtr value);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryExW(string file, IntPtr reserved, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr FindResourceW(IntPtr module, IntPtr name, IntPtr type);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool EnumResourceLanguagesW(IntPtr module, IntPtr type, IntPtr name, LanguageCallback callback, IntPtr value);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LoadResource(IntPtr module, IntPtr resource);
  [DllImport("kernel32.dll")] static extern IntPtr LockResource(IntPtr resource);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint SizeofResource(IntPtr module, IntPtr resource);
  [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr BeginUpdateResourceW(string file, bool deleteExisting);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateResourceW(IntPtr update, IntPtr type, IntPtr name, ushort language, byte[] data, uint bytes);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool EndUpdateResourceW(IntPtr update, bool discard);
  static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  public static string Read(string file) {
   // RT_MANIFEST / CREATEPROCESS_MANIFEST_RESOURCE_ID. Preserve elevation, DPI,
   // compatibility, icons and version resources; do not replace the whole manifest.
   var type = new IntPtr(24); var name = new IntPtr(1);
   var languages = new System.Collections.Generic.List<ushort>();
   IntPtr module = LoadLibraryExW(file, IntPtr.Zero, 0x22);
   Check(module != IntPtr.Zero);
   byte[] original;
   try {
    IntPtr resource = FindResourceW(module, name, type); Check(resource != IntPtr.Zero);
    uint size = SizeofResource(module, resource); Check(size > 0);
    IntPtr loaded = LoadResource(module, resource); Check(loaded != IntPtr.Zero);
    IntPtr address = LockResource(loaded); Check(address != IntPtr.Zero);
    original = new byte[size]; Marshal.Copy(address, original, 0, (int)size);
    LanguageCallback collect = (m,t,n,l,v) => { languages.Add(l); return true; };
    Check(EnumResourceLanguagesW(module, type, name, collect, IntPtr.Zero));
   } finally { FreeLibrary(module); }
   return Encoding.UTF8.GetString(original).TrimEnd('\0');
  }
  public static void Write(string file, string text) {
   var type = new IntPtr(24); var name = new IntPtr(1);
   var languages = new System.Collections.Generic.List<ushort>();
   IntPtr module = LoadLibraryExW(file, IntPtr.Zero, 0x22); Check(module != IntPtr.Zero);
   try {
    LanguageCallback collect = (m,t,n,l,v) => { languages.Add(l); return true; };
    Check(EnumResourceLanguagesW(module, type, name, collect, IntPtr.Zero));
   } finally { FreeLibrary(module); }
   var content = new UTF8Encoding(false).GetBytes(text);
   IntPtr update = BeginUpdateResourceW(file, false); Check(update != IntPtr.Zero);
   bool committed = false;
   try {
    foreach (ushort language in languages) Check(UpdateResourceW(update, type, name, language, content, (uint)content.Length));
    Check(EndUpdateResourceW(update, false)); committed = true;
   } finally { if (!committed) EndUpdateResourceW(update, true); }
  }
 }
}
'@
}
$file = [IO.Path]::GetFullPath($Executable)
if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Launcher missing: $file" }
$xml = [Xml.XmlDocument]::new()
$xml.PreserveWhitespace = $true
$xml.LoadXml([FigTide.NativeManifest]::Read($file))
$namespaces = [Xml.XmlNamespaceManager]::new($xml.NameTable)
$namespaces.AddNamespace('v3', 'urn:schemas-microsoft-com:asm.v3')
$windows = $xml.SelectSingleNode('/*/v3:application/v3:windowsSettings', $namespaces)
if (!$windows) { throw 'Expected jpackage windowsSettings manifest element' }
$settings = 'http://schemas.microsoft.com/SMI/2019/WindowsSettings'
$codepage = $windows.GetElementsByTagName('activeCodePage', $settings) | Select-Object -First 1
if (!$codepage) { $codepage = $xml.CreateElement('activeCodePage', $settings); [void]$windows.AppendChild($codepage) }
$codepage.InnerText = 'UTF-8'
$attributes = [IO.File]::GetAttributes($file)
try {
    [IO.File]::SetAttributes($file, $attributes -band (-bnot [IO.FileAttributes]::ReadOnly))
    [FigTide.NativeManifest]::Write($file, $xml.OuterXml)
} finally { [IO.File]::SetAttributes($file, $attributes) }
Write-Output $xml.OuterXml
