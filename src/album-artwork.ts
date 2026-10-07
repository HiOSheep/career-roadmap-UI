import * as THREE from "three";
import { albumForMonth, albumMonths } from "./albums";
import { assetUrl } from "./asset-url";

export async function loadAlbumArtwork() {
  const images = await Promise.all(albumMonths.map(async (month, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const album = albumForMonth(index);
    if (album) {
      const img = new Image();
      img.src = assetUrl(album.cover);
      await img.decode();
      return img;
    } else {
      ctx.fillStyle = "#d5d5c8"; ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#636958"; ctx.font = "bold 42px sans-serif";
      ctx.fillText(String(index + 1).padStart(2, "0"), 18, 82);
      ctx.font = "14px sans-serif"; ctx.fillText(month.monthId, 18, 126);
      ctx.font = "10px sans-serif"; ctx.fillText("ROADMAP ENTRY", 18, 224);
    }
    return canvas;
  }));
  const textures = images.map(image => {
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    texture.userData.albumArtwork = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 768;
  images.forEach((tile, i) => canvas.getContext("2d")!.drawImage(tile, (i % 4) * 256, Math.floor(i / 4) * 256, 256, 256));
  const atlas = new THREE.CanvasTexture(canvas); atlas.colorSpace = THREE.SRGBColorSpace;
  return { textures, atlas };
}

export function albumArtworkMesh(texture: THREE.Texture) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.46, 3.46).translate(.15, 1.85, .214),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.FrontSide }));
  mesh.name = "album-artwork";
  mesh.userData = { cdPart: "lid", assemblyPart: "lid", albumArtwork: true };
  return mesh;
}

/** Stock colour of the booklet's reverse, so it reads as a sheet under the lid. */
export const BOOKLET_STOCK = 0xe9e4d7;

export function albumBookletMesh() {
  // The booklet sits under the lid clips, and this is its reverse: the cover
  // belongs on the outside of the lid, so the inside face is plain stock. It
  // still counts as a printed lid surface for occlusion and for the frost.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateY(Math.PI).translate(.15, 1.85, .115),
    new THREE.MeshBasicMaterial({ color: BOOKLET_STOCK, toneMapped: false }));
  mesh.name = "album-booklet";
  mesh.userData = { cdPart: "lid", assemblyPart: "lid", albumArtwork: true, booklet: true };
  return mesh;
}

export function albumDiscMesh(texture: THREE.Texture) {
  const geometry = new THREE.RingGeometry(.39, 1.51, 128);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i)/3.02+.5, position.getY(i)/3.02+.5);
  // The ring stays centred on its own origin so the disc can turn in place while
  // its album plays; its place in the case is the mesh's position.
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
  mesh.position.set(.16, 1.78, .098);
  mesh.name = "album-disc";
  mesh.userData = {cdPart:"disc",assemblyPart:"disc",albumArtwork:true};
  return mesh;
}
