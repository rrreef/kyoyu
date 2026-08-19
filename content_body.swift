L4089:     var body: some View {
L4090:         GeometryReader { geo in
L4091:             ZStack(alignment: .bottom) {
L4092:                 // ── Dock geometry ─────────────────────────────────────────
L4093:                 let screenW  = geo.size.width
L4094:                 let safeBot  = geo.safeAreaInsets.bottom
L4095:                 let dockH    = 68 + safeBot
L4096:                 let isFullscreenExpanded = playerBridge.isExpanded && playerBridge.playerStyle == "fullscreen"
L4097:                 let dockCond = bridge.isLoggedIn && !showSplash && !isFullscreenExpanded
L4098: 
L4099:                 // Single WebView — always alive, fills entire screen
L4100:                 NavigableWebView(bridge: bridge, navigator: navigator, avatarBridge: avatarBridge, routeBridge: routeBridge, uploadBridge: uploadBridge, statusBridge: statusBridge, playerBridge: playerBridge, overlayBridge: overlayBridge, appIconBridge: appIconBridge, selectedTab: selectedTab)
L4101:                     .ignoresSafeArea()
L4102:                     .statusBar(hidden: statusBridge.isHidden)
L4103: 
L4104:                 // ── Single fixed dock ─────────────────────────────────────────
L4105:                 // GlassTabBar is the ONLY glass pill — it never moves.
L4106:                 // When player is visible, GlassTabBar hides its icons/selection and
L4107:                 // MiniPlayerBar fades in on top. Swipe cross-fades between the two states.
L4108:                 if dockCond {
L4109:                     // ── Home filter glass card (above tab bar) ──
L4110:                     if selectedTab == 0 {
L4111:                         HomeFilterBar(navigator: navigator)
L4112:                             .padding(.horizontal, 21)
L4113:                             .frame(height: 33)
L4114:                             .offset(y: -81)
L4115:                     }
L4116: 
L4117:                     // ── Library filter glass card (above tab bar) ──
L4118:                     if selectedTab == 1 {
L4119:                         LibraryFilterBar(navigator: navigator)
L4120:                             .padding(.horizontal, 21)
L4121:                             .frame(height: 33)
L4122:                             .offset(y: -81)
L4123:                     }
L4124: 
L4125:                     // ── Search filter glass card (above tab bar) ──
L4126:                     if selectedTab == 2 {
L4127:                         SearchFilterBar(navigator: navigator)
L4128:                             .padding(.horizontal, 21)
L4129:                             .frame(height: 33)
L4130:                             .offset(y: keyboard.height > 0 ? -81 - (keyboard.height - safeBot) : -81)
L4131:                     }
L4132: 
L4133:                     ZStack(alignment: .top) {
L4134: 
L4135:                         // ── GlassTabBar is ALWAYS in the ZStack in every state.
L4136:                         //    Its UIKit safe-area interaction anchors the dock to
L4137:                         //    the correct y-position. Removing it shifts the dock
L4138:                         //    down. showPlayer:isVisible → blank items (glass only).
L4139:                         GlassTabBar(
L4140:                             selectedIndex: $selectedTab,
L4141:                             showPlayer: playerBridge.isVisible || selectedTab == 2
L4142:                         ) { tab in
L4143:                             if tab == selectedTab {
L4144:                                 // Same tab tapped → scroll to top / go to root
L4145:                                 navigator.navigate(to: tabRoutes[tab])
L4146:                             } else {
L4147:                                 selectedTab = tab
L4148:                                 // navigateToTab() in updateUIView handles the SPA navigation
L4149:                             }
L4150:                         }
L4151:                         // opacity(0) in states 2&3 and search: invisible but stays in the UIKit
L4152:                         // hierarchy so its safe-area anchoring keeps the dock at the
L4153:                         // correct y-position. Using `if` removal caused a 7.5pt shift.
L4154:                         .opacity(playerBridge.isVisible || selectedTab == 2 ? 0 : 1)
L4155:                         .allowsHitTesting(!playerBridge.isVisible && selectedTab != 2)
L4156: 
L4157:                         // ── Search State A: 3-dot circle + search pill ──
L4158:                         if selectedTab == 2 && showSearchInput && (!playerBridge.isVisible || !showPlayer) {
L4159:                             HStack(alignment: .center, spacing: 10) {
L4160: 
L4161:                                 // "Go to tabs" glass circle
L4162:                                 Button {
L4163:                                     withAnimation(.spring(response: 0.24, dampingFraction: 0.82)) {
L4164:                                         showSearchInput = false
L4165:                                     }
L4166:                                 } label: {
L4167:                                     Image(systemName: "ellipsis")
L4168:                                         .font(.system(size: 20, weight: .semibold))
L4169:                                         .foregroundStyle(.white)
L4170:                                         .frame(width: 62, height: 62)
L4171:                                         .contentShape(Circle())
L4172:                                 }
L4173:                                 .buttonStyle(.plain)
L4174:                                 .background(GlassCircle())
L4175: 
L4176:                                 // ── Artwork Circle (ONLY IF MUSIC IS PLAYING) ──
L4177:                                 if playerBridge.isVisible {
L4178:                                     Button {
L4179:                                         withAnimation(.spring(response: 0.24, dampingFraction: 0.82)) {
L4180:                                             showPlayer = true
L4181:                                             showSearchInput = false
L4182:                                         }
L4183:                                     } label: {
L4184:                                         Group {
L4185:                                             if !playerBridge.artworkUrl.isEmpty,
L4186:                                                let url = URL(string: playerBridge.artworkUrl) {
L4187:                                                 AsyncImage(url: url) { phase in
L4188:                                                     if case .success(let img) = phase {
L4189:                                                         img.resizable()
L4190:                                                            .aspectRatio(contentMode: .fill)
L4191:                                                            .frame(width: 38, height: 38)
L4192:                                                            .clipShape(RoundedRectangle(cornerRadius: 9))
L4193:                                                     } else {
L4194:                                                         Image(systemName: "waveform")
L4195:                                                             .font(.system(size: 20, weight: .semibold))
L4196:                                                             .foregroundStyle(.white)
L4197:                                                     }
L4198:                                                 }
L4199:                                             } else {
L4200:                                                 Image(systemName: "waveform")
L4201:                                                     .font(.system(size: 20, weight: .semibold))
L4202:                                                     .foregroundStyle(.white)
L4203:                                             }
L4204:                                         }
L4205:                                         .frame(width: 62, height: 62)
L4206:                                         .contentShape(Circle())
L4207:                                     }
L4208:                                     .buttonStyle(.plain)
L4209:                                     .background(GlassCircle())
L4210:                                 }
L4211: 
L4212:                                 // Search input pill
L4213:                                 SearchBar(navigator: navigator, selectedTab: $selectedTab)
L4214:                             }
L4215:                             .padding(.horizontal, 21)
L4216:                             .frame(height: 62)
L4217:                             .offset(y: keyboard.height > 0 ? -(keyboard.height - safeBot) : 0)
L4218:                             .transition(.opacity)
L4219:                         }
L4220: 
L4221:                         // ── Search State B: search icon circle + filtered tab pill ──
L4222:                         if selectedTab == 2 && !playerBridge.isVisible && !showSearchInput {
L4223:                             HStack(alignment: .center, spacing: 10) {
L4224: 
L4225:                                 // "Go to search" glass circle
L4226:                                 Button {
L4227:                                     withAnimation(.spring(response: 0.24, dampingFraction: 0.82)) {
L4228:                                         showSearchInput = true
L4229:                                     }
L4230:                                 } label: {
L4231:                                     Image(systemName: "magnifyingglass")
L4232:                                         .font(.system(size: 20, weight: .semibold))
L4233:                                         .foregroundStyle(.white)
L4234:                                         .frame(width: 62, height: 62)
L4235:                                         .contentShape(Circle())
L4236:                                 }
L4237:                                 .buttonStyle(.plain)
L4238:                                 .background(GlassCircle())
L4239: 
L4240:                                 // Separate glass pill — all tabs with selection indicator
L4241:                                 FilteredTabPill(selectedIndex: selectedTab) { tab in
L4242:                                     if tab == selectedTab {
L4243:                                         navigator.navigate(to: tabRoutes[tab])
L4244:                                     } else {
L4245:                                         selectedTab = tab
L4246:                                     }
L4247:                                 }
L4248:                                 .frame(maxWidth: .infinity)
L4249:                             }
L4250:                             .padding(.horizontal, 21)
L4251:                             .frame(height: 62)
L4252:                             .transition(.opacity)
L4253:                         }
L4254: 
L4255:                         // ── STATE 2: circle (left) + filtered tab pill (right) ───
L4256:                         if playerBridge.isVisible && !showPlayer && (!showSearchInput || selectedTab != 2) {
L4257:                             HStack(alignment: .center, spacing: 10) {
L4258: 
L4259:                                 // "Go to player" glass circle
L4260:                                 Button {
L4261:                                     withAnimation(.spring(response: 0.24, dampingFraction: 0.82)) {
L4262:                                         showPlayer = true
L4263:                                     }
L4264:                                 } label: {
L4265:                                     Group {
L4266:                                         if !playerBridge.artworkUrl.isEmpty,
L4267:                                            let url = URL(string: playerBridge.artworkUrl) {
L4268:                                             AsyncImage(url: url) { phase in
L4269:                                                 if case .success(let img) = phase {
L4270:                                                     img.resizable()
L4271:                                                        .aspectRatio(contentMode: .fill)
L4272:                                                        .frame(width: 38, height: 38)
L4273:                                                        .clipShape(RoundedRectangle(cornerRadius: 9))
L4274:                                                 } else {
L4275:                                                     Image(systemName: "waveform")
L4276:                                                         .font(.system(size: 20, weight: .semibold))
L4277:                                                         .foregroundStyle(.white)
L4278:                                                 }
L4279:                                             }
L4280:                                         } else {
L4281:                                             Image(systemName: "waveform")
L4282:                                                 .font(.system(size: 20, weight: .semibold))
L4283:                                                 .foregroundStyle(.white)
L4284:                                         }
L4285:                                     }
L4286:                                     .frame(width: 62, height: 62)
L4287:                                     .contentShape(Circle())
L4288:                                 }
L4289:                                 .buttonStyle(.plain)
L4290:                                 .background(GlassCircle())
L4291: 
L4292:                                 // Separate glass pill — all tabs with selection indicator
L4293:                                 FilteredTabPill(selectedIndex: selectedTab) { tab in
L4294:                                     if tab == selectedTab {
L4295:                                         navigator.navigate(to: tabRoutes[tab])
L4296:                                     } else {
L4297:                                         selectedTab = tab
L4298:                                     }
L4299:                                 }
L4300:                                 .frame(maxWidth: .infinity)
L4301:                             }
L4302:                             .padding(.horizontal, 21)
L4303:                             .frame(height: 62)
L4304:                             .transition(.opacity)
L4305:                         }
L4306: 
L4307:                         // ── STATE 3: circle (left) + player glass pill (right) ────
L4308:                         if playerBridge.isVisible && showPlayer {
L4309:                             HStack(alignment: .center, spacing: 10) {
L4310: 
L4311:                                 // "Go to tabs" glass circle
L4312:                                 Button {
L4313:                                     withAnimation(.spring(response: 0.24, dampingFraction: 0.82)) {
L4314:                                         showPlayer = false
L4315:                                         if selectedTab == 2 {
L4316:                                             showSearchInput = false
L4317:                                         }
L4318:                                     }
L4319:                                 } label: {
L4320:                                     Image(systemName: "ellipsis")
L4321:                                         .font(.system(size: 20, weight: .semibold))
L4322:                                         .foregroundStyle(.white)
L4323:                                         .frame(width: 62, height: 62)
L4324:                                         .contentShape(Circle())
L4325:                                 }
L4326:                                 .buttonStyle(.plain)
L4327:                                 .background(GlassCircle())
L4328: 
L4329:                                 // ── Search Circle (ONLY ON TAB 2) ──
L4330:                                 if selectedTab == 2 {
L4331:                                     Button {
L4332:                                         withAnimation(.spring(response: 0.24, dampingFraction: 0.82)) {
L4333:                                             showSearchInput = true
L4334:                                             showPlayer = false
L4335:                                         }
L4336:                                     } label: {
L4337:                                         Image(systemName: "magnifyingglass")
L4338:                                             .font(.system(size: 20, weight: .semibold))
L4339:                                             .foregroundStyle(.white)
L4340:                                             .frame(width: 62, height: 62)
L4341:                                             .contentShape(Circle())
L4342:                                     }
L4343:                                     .buttonStyle(.plain)
L4344:                                     .background(GlassCircle())
L4345:                                 }
L4346: 
L4347:                                 // Separate glass player pill
L4348:                                 ZStack {
L4349:                                     GlassCapsule()
L4350:                                     MiniPlayerBar(playerBridge: playerBridge, isCompact: selectedTab == 2)
L4351:                                 }
L4352:                                 .frame(height: 62)
L4353:                                 .frame(maxWidth: .infinity)
L4354:                                 .simultaneousGesture(
L4355:                                     LongPressGesture(minimumDuration: 0.6)
L4356:                                         .onEnded { _ in
L4357:                                             let generator = UIImpactFeedbackGenerator(style: .heavy)
L4358:                                             generator.impactOccurred()
L4359:                                             withAnimation(.spring(response: 0.25, dampingFraction: 0.82)) {
L4360:                                                 showPlayer = false
L4361:                                                 playerBridge.isVisible = false
L4362:                                             }
L4363:                                             playerBridge.send("stop")
L4364:                                         }
L4365:                                 )
L4366:                                 .gesture(
L4367:                                     DragGesture()
L4368:                                         .onEnded { value in
L4369:                                             if value.translation.height > 50 || value.velocity.height > 300 {
L4370:                                                 withAnimation(.spring(response: 0.25, dampingFraction: 0.82)) {
L4371:                                                     playerBridge.isExpanded = false
L4372:                                                 }
L4373:                                             }
L4374:                                         }
L4375:                                 )
L4376:                             }
L4377:                             .padding(.horizontal, 21)
L4378:                             .frame(height: 62)
L4379:                             .transition(.opacity)
L4380:                         }
L4381: 
L4382:                     }
L4383:                     .frame(width: screenW, height: dockH)
L4384:                     .ignoresSafeArea(edges: .bottom)
L4385:                 }
L4386: 
L4387:                 // ── Auto-switch when playback starts / stops ───────────────
L4388:                 // (Handled via onChange below — see .onChange at body bottom)
L4389: 
L4390:                 // Back + top-right cluster — hidden while full player open OR native web modal open
L4391:                 if bridge.isLoggedIn && !showSplash && !isFullscreenExpanded && !overlayBridge.isOpen {
L4392:                     let topInset = geo.safeAreaInsets.top
L4393:                     BackButtonOverlay(routeBridge: routeBridge, navigator: navigator, safeAreaTop: topInset)
L4394:                         .ignoresSafeArea()
L4395:                     TopClusterOverlay(navigator: navigator, avatarBridge: avatarBridge, routeBridge: routeBridge, safeAreaTop: topInset)
L4396:                         .ignoresSafeArea()
L4397:                 }
L4398: 
L4399:                 // ── Sheet pager: album + player + playlist ──────────────
L4400:                 let hasPlayer = playerBridge.isVisible && playerBridge.playerStyle == "sheet"
L4401:                 let hasPlaylist = playerBridge.showPlaylistPicker
L4402:                 let canPaginate = playerBridge.nativeAlbumData != nil && (hasPlayer || hasPlaylist)
L4403:                 let sheetScreenW = geo.size.width
L4404: 
L4405:                 if canPaginate, let album = playerBridge.nativeAlbumData {
L4406:                     // Build list of available pages: 0=album, 1=player, 2=playlist
L4407:                     let availablePages: [Int] = [0] + (hasPlayer ? [1] : []) + (hasPlaylist ? [2] : [])
L4408: 
L4409:                     // Offset helper: active page follows finger, incoming page on the other side, rest parked
L4410:                     let albumOff:  CGFloat = sheetPage == 0 ? sheetDragX : (sheetNextPage == 0 && sheetDragX != 0 ? sheetOtherSide * sheetScreenW + sheetDragX : sheetPageParked[0] ?? 0)
L4411:                     let playerOff: CGFloat = sheetPage == 1 ? sheetDragX : (sheetNextPage == 1 && sheetDragX != 0 ? sheetOtherSide * sheetScreenW + sheetDragX : sheetPageParked[1] ?? sheetScreenW)
L4412: 
L4413:                     let sheetDragHandler: (CGFloat) -> Void = { dx in
L4414:                         if sheetDragX == 0 && dx != 0 {
L4415:                             sheetOtherSide = dx < 0 ? 1 : -1
L4416:                             // Cycle through only available pages
L4417:                             if let idx = availablePages.firstIndex(of: sheetPage) {
L4418:                                 if dx < 0 {
L4419:                                     sheetNextPage = availablePages[(idx + 1) % availablePages.count]
L4420:                                 } else {
L4421:                                     sheetNextPage = availablePages[(idx - 1 + availablePages.count) % availablePages.count]
L4422:                                 }
L4423:                             }
L4424:                         }
L4425:                         sheetDragX = dx
L4426:                     }
L4427:                     let sheetSwipeHandler: () -> Void = {
L4428:                         let exitDir: CGFloat = sheetDragX < 0 ? -1 : 1
L4429:                         withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) {
L4430:                             sheetPageParked[sheetPage] = exitDir * sheetScreenW
L4431:                             sheetPage = sheetNextPage
L4432:                             sheetDragX = 0
L4433:                             playerBridge.isExpanded = (sheetNextPage == 1)
L4434:                         }
L4435:                     }
L4436: 
L4437:                     AlbumSheetView(playerBridge: playerBridge, album: album, onClose: {
L4438:                         let ts = album.ts ?? ""
L4439:                         playerBridge.albumWebView?.evaluateJavaScript("if(window.__kyoyuCloseNativeAlbum) { window.__kyoyuCloseNativeAlbum('\(ts)'); }")
L4440:                     }, onDismissNow: {
L4441:                         playerBridge.nativeAlbumData = nil
L4442:                         playerBridge.nativePlaylistId = nil
L4443:                     }, onSheetDrag: sheetDragHandler,
L4444:                        onSheetSwipe: sheetSwipeHandler)
L4445:                     .offset(x: albumOff)
L4446:                     .zIndex(100)
L4447: 
L4448:                     // Player page — only when music is playing
L4449:                     if hasPlayer {
L4450:                         NativePlayerView(playerBridge: playerBridge,
L4451:                            onSheetDrag: sheetDragHandler,
L4452:                            onSheetSwipe: sheetSwipeHandler) {
L4453:                             withAnimation(.spring(response: 0.20, dampingFraction: 0.85)) {
L4454:                                 playerBridge.isExpanded = false
L4455:                             }
L4456:                         }
L4457:                         .offset(x: playerOff)
L4458:                         .zIndex(101)
L4459:                     }
L4460: 
L4461:                     // Playlist page — part of pager when open
L4462:                     if hasPlaylist {
L4463:                         let playlistOff: CGFloat = sheetPage == 2 ? sheetDragX : (sheetNextPage == 2 && sheetDragX != 0 ? sheetOtherSide * sheetScreenW + sheetDragX : sheetPageParked[2] ?? sheetScreenW)
L4464: 
L4465:                         PlaylistPickerSheet(playerBridge: playerBridge,
L4466:                            onSheetDrag: sheetDragHandler,
L4467:                            onSheetSwipe: sheetSwipeHandler,
L4468:                            onClose: {
L4469:                             let sw = sheetScreenW
L4470:                             withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) {
L4471:                                 sheetPageParked[2] = sw
L4472:                                 sheetPage = 0
L4473:                                 playerBridge.isExpanded = false
L4474:                             }
L4475:                             DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
L4476:                                 playerBridge.showPlaylistPicker = false
L4477:                             }
L4478:                         })
L4479:                         .offset(x: playlistOff)
L4480:                         .zIndex(102)
L4481:                     }
L4482: 
L4483:                 } else {
L4484:                     // Single sheet mode — standard transitions
L4485:                     if let album = playerBridge.nativeAlbumData {
L4486:                         AlbumSheetView(playerBridge: playerBridge, album: album, onClose: {
L4487:                             let ts = album.ts ?? ""
L4488:                             playerBridge.albumWebView?.evaluateJavaScript("if(window.__kyoyuCloseNativeAlbum) { window.__kyoyuCloseNativeAlbum('\(ts)'); }")
L4489:                         }, onDismissNow: {
L4490:                             playerBridge.nativeAlbumData = nil
L4491:                             playerBridge.nativePlaylistId = nil
L4492:                         })
L4493:                         .transition(.move(edge: .bottom))
L4494:                         .zIndex(100)
L4495:                     }
L4496: 
L4497:                     if playerBridge.isExpanded && playerBridge.playerStyle == "sheet" {
L4498:                         NativePlayerView(playerBridge: playerBridge) {
L4499:                             withAnimation(.spring(response: 0.20, dampingFraction: 0.85)) {
L4500:                                 playerBridge.isExpanded = false
L4501:                             }
L4502:                         }
L4503:                         .transition(.move(edge: .bottom))
L4504:                         .zIndex(101)
L4505:                     }
L4506:                 }
L4507: 
L4508:                 if showSplash {
L4509:                     SplashView(onDone: { showSplash = false })
L4510:                 }
L4511:             }
L4512:         }
L4513:         .ignoresSafeArea()
L4514:         // Auto-switch dock when playback starts or stops
L4515:         .onChange(of: playerBridge.isVisible) { _, isVisible in
L4516:             withAnimation(.spring(response: 0.24, dampingFraction: 0.82)) {
L4517:                 showPlayer = isVisible
L4518:             }
L4519:         }
L4520:         .onChange(of: selectedTab) { _, newTab in
L4521:             if newTab == 2 {
L4522:                 showSearchInput = true
L4523:             }
L4524:         }
L4525:         .onChange(of: keyboard.height) { _, height in
L4526:             let js = "window.dispatchEvent(new CustomEvent('kyoyu-keyboard-change', {detail: \(height)}));"
L4527:             navigator.webView?.evaluateJavaScript(js, completionHandler: nil)
L4528:         }
L4529:         // ── Playlist pager integration ──────────────────────────────────
L4530:         .onChange(of: playerBridge.showPlaylistPicker) { _, newVal in
L4531:             guard playerBridge.nativeAlbumData != nil else { return }
L4532:             let sw = UIScreen.main.bounds.width
L4533:             if newVal {
L4534:                 // Open: position playlist off-screen right, then animate it in
L4535:                 sheetPageParked[2] = sw
L4536:                 withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) {
L4537:                     sheetPageParked[sheetPage] = -sw
L4538:                     sheetPage = 2
L4539:                     playerBridge.isExpanded = false
L4540:                 }
L4541:             }
L4542:         }
L4543:         .onChange(of: sheetPage) { _, newPage in
L4544:             // When user swipes away from playlist, clean up after animation
L4545:             if newPage != 2 && playerBridge.showPlaylistPicker {
L4546:                 DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
L4547:                     playerBridge.showPlaylistPicker = false
L4548:                 }
L4549:             }
L4550:         }
L4551:         // Sync sheetPage when isExpanded changes externally (mini player expand/collapse)
L4552:         .onChange(of: playerBridge.isExpanded) { _, newVal in
L4553:             let cp = playerBridge.nativeAlbumData != nil && playerBridge.isVisible && playerBridge.playerStyle == "sheet"
L4554:             guard cp else { return }
L4555:             let sw = UIScreen.main.bounds.width
L4556:             if newVal && sheetPage != 1 {
L4557:                 withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) {
L4558:                     sheetPageParked[sheetPage] = -sw
L4559:                     sheetPage = 1
L4560:                 }
L4561:             } else if !newVal && sheetPage == 1 {
L4562:                 withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) {
L4563:                     sheetPageParked[1] = sw
L4564:                     sheetPage = 0
L4565:                 }
L4566:             }
L4567:         }
L4568:         // Reset pager when album is dismissed
L4569:         .onChange(of: playerBridge.nativeAlbumData?.id) { _, newId in
L4570:             if newId == nil {
L4571:                 sheetPage = 0
L4572:                 sheetDragX = 0
L4573:                 sheetPageParked = [:]
L4574:             }
L4575:         }
L4576:     }
L4577: }
L4578: 
L4579: #Preview { ContentView() }
L4580: import SwiftUI
L4581: 
L4582: struct NativeTrack: Codable, Identifiable {
