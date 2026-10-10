// Chop knife UI: menu with calibration and food buttons, then a touch-proof knife mode.
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var link: Link
    @EnvironmentObject var tracker: Tracker
    let haptics: Haptics

    @State private var countdown = 0
    @State private var knifeMode = false
    @State private var ip = ""
    @State private var upSince: Date?

    private let accent = Color(red: 1.0, green: 0.54, blue: 0.12)
    private let background = Color(red: 0.07, green: 0.065, blue: 0.06)

    var body: some View {
        ZStack {
            background.ignoresSafeArea()
            if knifeMode { knifeScreen.transition(.opacity) } else { menu.transition(.opacity) }
        }
        .animation(.easeInOut(duration: 0.25), value: knifeMode)
        .preferredColorScheme(.dark)
        .onChange(of: tracker.screenUp) { _, up in
            guard knifeMode, countdown == 0 else { return }
            if up {
                let since = Date()
                upSince = since
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    if tracker.screenUp, upSince == since {
                        knifeMode = false
                        haptics.play(0.6, 0.3)
                    }
                }
            } else {
                upSince = nil
            }
        }
    }

    private var statusRow: some View {
        HStack(spacing: 10) {
            Circle().fill(link.connected ? Color.green : Color.gray).frame(width: 10, height: 10)
            Text(link.status).font(.system(size: 16, weight: .semibold))
            Spacer()
            Text(trackingText).font(.system(size: 14, weight: .medium)).foregroundStyle(.secondary)
        }
    }

    private var trackingText: String {
        switch tracker.quality {
        case 2: return "Śledzenie OK"
        case 1: return "Rusz telefonem"
        default: return "Kamera startuje"
        }
    }

    private var menu: some View {
        VStack(spacing: 22) {
            statusRow
            Spacer()
            Button(action: calibrate) {
                VStack(spacing: 6) {
                    Text(link.calibrated ? "Kalibruj ponownie" : "Kalibruj")
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                    Text("potem chwyć telefon jak nóż")
                        .font(.system(size: 15, weight: .medium))
                        .opacity(0.7)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 34)
                .background(accent, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .foregroundStyle(.black)
            }
            .disabled(!link.connected)
            .opacity(link.connected ? 1 : 0.4)
            Text("Dół telefonu w dłoni, górą od siebie, ekran w bok. Podczas odliczania oprzyj pięść o stół, jakby ostrze dotykało deski.")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Spacer()
            HStack(spacing: 10) {
                foodButton("Marchewka", "carrot")
                foodButton("Ogórek", "cucumber")
                foodButton("Jabłko", "apple")
            }
            Button {
                link.send("{\"t\":\"clear\"}")
            } label: {
                Text("Od nowa")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.white.opacity(0.08), in: Capsule())
            }
            .foregroundStyle(.white)
            if !link.connected { manualConnect }
        }
        .padding(24)
    }

    private func foodButton(_ title: String, _ kind: String) -> some View {
        Button {
            link.send("{\"t\":\"spawn\",\"k\":\"\(kind)\"}")
            haptics.play(0.4, 0.5)
        } label: {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.white.opacity(0.08), in: Capsule())
        }
        .foregroundStyle(.white)
        .disabled(!link.connected)
    }

    private var manualConnect: some View {
        HStack(spacing: 10) {
            TextField("IP Maca", text: $ip)
                .keyboardType(.decimalPad)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.white.opacity(0.08), in: Capsule())
            Button("Połącz") { link.connectManual(ip) }
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(accent)
        }
    }

    private var knifeScreen: some View {
        VStack(spacing: 18) {
            Spacer()
            if countdown > 0 {
                Text("\(countdown)")
                    .font(.system(size: 180, weight: .heavy, design: .rounded))
                    .foregroundStyle(accent)
                    .contentTransition(.numericText())
            } else {
                Image(systemName: "fork.knife")
                    .font(.system(size: 84, weight: .semibold))
                    .foregroundStyle(accent)
                Text("Nóż aktywny")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
            }
            Text(countdown > 0 ? "Oprzyj pięść o stół" : "Połóż telefon ekranem do góry, żeby wrócić do menu")
                .font(.system(size: 16))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture {}
    }

    private func calibrate() {
        knifeMode = true
        countdown = 3
        step()
    }

    private func step() {
        link.send("{\"t\":\"count\",\"n\":\(countdown)}")
        haptics.play(0.5, 0.8)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation { countdown -= 1 }
            if countdown > 0 {
                step()
            } else {
                link.send("{\"t\":\"count\",\"n\":0}")
                link.send("{\"t\":\"cal\"}")
            }
        }
    }
}
