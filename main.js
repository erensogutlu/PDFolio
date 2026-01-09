// pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
	"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let pdf_belgesi = null;
let mevcut_yaprak = 0;
let toplam_sayfa = 0;
let toplam_yaprak = 0;
let mevcut_zoom = 1.0;
let mobil_mod = false;
let render_ediliyor = false;

const dosya_girdisi = document.getElementById("dosya-girdisi");
const okuyucu_arayuzu = document.getElementById("okuyucu-arayuzu");
const dergi_kitabi = document.getElementById("dergi-kitabi");
const sahne = document.getElementById("sahne");
const sayfa_bilgisi = document.getElementById("sayfa-bilgisi");
const sonraki_btn = document.getElementById("sonraki-btn");
const onceki_btn = document.getElementById("onceki-btn");
const islem_cubugu = document.getElementById("islem-cubugu-kapsayici");
const yukleme_ekrani = document.getElementById("yukleme-ekrani");
const surukle_alani = document.getElementById("surukle-birak-alani");
const zoom_kontrolleri = document.getElementById("zoom-kontrolleri");
const zoom_bilgi = document.getElementById("zoom-bilgi");

dosya_girdisi.addEventListener("change", dosya_yukle);
sonraki_btn.addEventListener("click", sonraki_sayfaya_git);
onceki_btn.addEventListener("click", onceki_sayfaya_git);

// pencere boyutu değişince modu kontrol et
let boyutlandirma_zamanlayicisi;
window.addEventListener("resize", () => {
	clearTimeout(boyutlandirma_zamanlayicisi);
	boyutlandirma_zamanlayicisi = setTimeout(() => {
		if (pdf_belgesi) kitap_yeniden_olustur();
	}, 500);
});

// sürükle bırak
surukle_alani.addEventListener("dragover", (e) => {
	e.preventDefault();
	surukle_alani.classList.add("border-blue-500", "bg-slate-800");
});
surukle_alani.addEventListener("dragleave", (e) => {
	e.preventDefault();
	surukle_alani.classList.remove("border-blue-500", "bg-slate-800");
});
surukle_alani.addEventListener("drop", (e) => {
	e.preventDefault();
	surukle_alani.classList.remove("border-blue-500", "bg-slate-800");
	if (e.dataTransfer.files.length) {
		dosya_girdisi.files = e.dataTransfer.files;
		dosya_yukle({ target: dosya_girdisi });
	}
});

function dosya_yukle(e) {
	const dosya = e.target.files[0];
	if (dosya && dosya.type === "application/pdf") {
		yukleme_ekrani.style.opacity = "0";
		setTimeout(() => {
			yukleme_ekrani.style.display = "none";
			okuyucu_arayuzu.classList.remove("hidden");
			okuyucu_arayuzu.classList.add("flex");
			islem_cubugu.classList.remove("hidden");
			zoom_kontrolleri.classList.remove("hidden");
			zoom_kontrolleri.classList.add("flex");
		}, 500);

		const okuyucu = new FileReader();
		okuyucu.onload = (ev) => pdf_baslat(new Uint8Array(ev.target.result));
		okuyucu.readAsArrayBuffer(dosya);
	} else {
		alert("Geçersiz dosya formatı.");
	}
}

async function pdf_baslat(veri) {
	try {
		pdf_belgesi = await pdfjsLib.getDocument(veri).promise;
		toplam_sayfa = pdf_belgesi.numPages;
		await kitap_olustur();
		// islem cubugu artik kitap_olustur icinde yonetiliyor
	} catch (err) {
		console.error(err);
		alert("Hata oluştu.");
		sifirla();
	}
}

function mobil_kontrol() {
	// 768px altı mobil kabul edilir
	return window.innerWidth < 768;
}

async function kitap_yeniden_olustur() {
	// sadece mod değiştiyse yeniden oluştur
	const yeni_mod_mobil = mobil_kontrol();
	if (yeni_mod_mobil !== mobil_mod) {
		await kitap_olustur();
	}
}

async function kitap_olustur() {
	if (render_ediliyor) return;
	render_ediliyor = true;

	mobil_mod = mobil_kontrol();
	dergi_kitabi.innerHTML = "";

	// mod'a göre sınıf ekle/çıkar
	if (mobil_mod) {
		dergi_kitabi.classList.add("mobil-mod");
		toplam_yaprak = toplam_sayfa;
	} else {
		dergi_kitabi.classList.remove("mobil-mod");
		toplam_yaprak = Math.ceil(toplam_sayfa / 2);
	}

	// sayfayı sıfırla
	mevcut_yaprak = 0;
	durum_guncelle();

	for (let i = 0; i < toplam_yaprak; i++) {
		yaprak_dom_olustur(i);
	}

	await yaprak_icerik_render(0);

	islem_cubugu.classList.add("hidden");
	render_ediliyor = false;

	arkaplan_render_baslat();
}

function yaprak_dom_olustur(i) {
	const yaprak = document.createElement("div");
	yaprak.className = "yaprak";
	yaprak.id = `yaprak-${i}`;
	yaprak.style.zIndex = toplam_yaprak - i;

	const on_yuz = document.createElement("div");
	on_yuz.className = "on-yuz";
	on_yuz.id = `yaprak-${i}-on`; // ID ver ki sonradan bulalim
	const on_canvas = document.createElement("canvas");
	on_yuz.appendChild(on_canvas);

	const arka_yuz = document.createElement("div");
	arka_yuz.className = "arka-yuz";
	arka_yuz.id = `yaprak-${i}-arka`;
	const arka_canvas = document.createElement("canvas");
	arka_yuz.appendChild(arka_canvas);

	yaprak.appendChild(on_yuz);
	yaprak.appendChild(arka_yuz);
	dergi_kitabi.appendChild(yaprak);
}

async function arkaplan_render_baslat() {
	for (let i = 1; i < toplam_yaprak; i++) {
		await yaprak_icerik_render(i);
		// her yaprak arasında minik bir mola ver ki UI donmasın
		await new Promise((r) => setTimeout(r, 10));
	}
}

async function yaprak_icerik_render(i) {
	// yapragin canvaslarini bul
	const on_div = document.getElementById(`yaprak-${i}-on`);
	const arka_div = document.getElementById(`yaprak-${i}-arka`);

	if (!on_div) return; // Guvenlik

	const on_canvas = on_div.querySelector("canvas");
	const arka_canvas = arka_div.querySelector("canvas");

	// sayfa numaralarini hesapla
	let sayfa_no_on, sayfa_no_arka;

	if (mobil_mod) {
		sayfa_no_on = i + 1;
		sayfa_no_arka = null;
		arka_div.style.backgroundColor = "#fff";
	} else {
		sayfa_no_on = i * 2 + 1;
		sayfa_no_arka = i * 2 + 2;
	}

	// render et
	if (sayfa_no_on <= toplam_sayfa) await sayfa_render(sayfa_no_on, on_canvas);

	if (sayfa_no_arka && sayfa_no_arka <= toplam_sayfa) {
		await sayfa_render(sayfa_no_arka, arka_canvas);
	} else if (!mobil_mod) {
		arka_canvas.style.display = "none";
	}
}

async function sayfa_render(no, canvas) {
	try {
		if (!no) return;
		const sayfa = await pdf_belgesi.getPage(no);

		const dpr = window.devicePixelRatio || 1;

		const baz_olcek = mobil_mod ? 1.0 : 1.5;

		const viewport = sayfa.getViewport({ scale: baz_olcek * dpr });

		const context = canvas.getContext("2d");

		canvas.width = viewport.width;
		canvas.height = viewport.height;

		await sayfa.render({ canvasContext: context, viewport: viewport }).promise;
	} catch (e) {
		console.warn(`Sayfa ${no} render edilemedi:`, e);
	}
}

function sonraki_sayfaya_git() {
	if (mevcut_yaprak < toplam_yaprak) {
		const yaprak = document.getElementById(`yaprak-${mevcut_yaprak}`);
		yaprak.classList.add("cevrilmis");
		yaprak.style.zIndex = 1000 + mevcut_yaprak;
		mevcut_yaprak++;
		durum_guncelle();
	}
}

function onceki_sayfaya_git() {
	if (mevcut_yaprak > 0) {
		mevcut_yaprak--;
		const yaprak = document.getElementById(`yaprak-${mevcut_yaprak}`);
		yaprak.classList.remove("cevrilmis");
		setTimeout(() => {
			yaprak.style.zIndex = toplam_yaprak - mevcut_yaprak;
		}, 300);
		durum_guncelle();
	}
}

function durum_guncelle() {
	let yazi = "";
	if (mobil_mod) {
		const aktif_sayfa = Math.min(mevcut_yaprak + 1, toplam_sayfa);
		yazi = `${aktif_sayfa} / ${toplam_sayfa}`;
	} else {
		let sol_sayfa = mevcut_yaprak * 2;
		let sag_sayfa = sol_sayfa + 1;
		if (sol_sayfa === 0) sol_sayfa = "-";
		if (sag_sayfa > toplam_sayfa) sag_sayfa = "-";
		yazi = `${sol_sayfa} - ${sag_sayfa} / ${toplam_sayfa}`;
	}

	sayfa_bilgisi.innerText = yazi;
	onceki_btn.disabled = mevcut_yaprak === 0;
	sonraki_btn.disabled = mevcut_yaprak === toplam_yaprak;
}

// ZOOM FONKSİYONLARI
function zoom_degistir(miktar) {
	mevcut_zoom += miktar;
	if (mevcut_zoom < 0.5) mevcut_zoom = 0.5;
	if (mevcut_zoom > 3.0) mevcut_zoom = 3.0;
	zoom_uygula();
}

function zoom_sifirla() {
	mevcut_zoom = 1.0;
	zoom_uygula();
}

function zoom_uygula() {
	sahne.style.transform = `scale(${mevcut_zoom})`;
	zoom_bilgi.innerText = `%${Math.round(mevcut_zoom * 100)}`;
}

function sifirla() {
	location.reload();
}
