# Hyperfy community apps: inventory by licence and first ten library pieces

Card: t_bd9649fa (MIS-208 · line 11 · code L11). Read-only note, no code. Source: `https://apps.hyperfy.xyz/catalog.json` (version 4, generated 2026-02-23T05:42:07+00:00), 342 entries, copy kept in the house study `work/hyperfy-estudio/catalogo-crudo/`. Function groups come from `_cats.json` (rules over name, description and tags, same grouping as `AGRUPADO-POR-FUNCION.md`).

## Licence finding

- The catalog entries carry **no licence field** (keys per app: slug, name, author, description, tags, hyp_filename, download_path, source_status, script_path, …) and the `.hyp` headers do not hold one.
- The repository `hyperfy-xyz/hyperfy-apps` has **no LICENSE file** at its root (`raw.githubusercontent.com/.../main/LICENSE` returns 404, checked 2026-10-26). Without a licence the default is all rights reserved by each author.
- So every one of the 342 entries is marked **sin licencia** below. Rule from the traps register: a piece enters the house library only if (a) we write it ourselves from the *idea* (function and behaviour, not the script), or (b) the author gives a clear licence in writing (CC0/MIT) that allows redistributing the raw file. Never copy a `.hyp` script or its media.
- Authors are listed to know whom to ask; asking is a decision for Pablo (it costs time, not money).

## Summary by function

| Function | Entries | Distinct apps | Licence | Authors (top) |
|---|---|---|---|---|
| Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | 28 | 22 | sin licencia | 0mka (8), Gert-Jan Akerboom (6), general hyper (2) |
| Arma / disparo / proyectiles / sistema de combate PvP-PvE | 28 | 25 | sin licencia | Saori (6), ash (6), ~/drdoge.eth (6) |
| Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | 23 | 21 | sin licencia | ash (4), hypShaman (4), Shiffty (3) |
| Animación de malla o textura | 19 | 17 | sin licencia | vox (4), ash (3), cru (3) |
| Día-noche, cielo, sol, clima, nubes, niebla, lluvia | 17 | 15 | sin licencia | ash (8), ~/drdoge.eth (5), Gert-Jan Akerboom (3) |
| PNJ acompañante / mascota / seguidor / rover recolector | 17 | 16 | sin licencia | ~/drdoge.eth (5), MetaRick (4), ~/MayD524/Hyperfy (3) |
| Teletransporte / portal / punto de aparición | 17 | 12 | sin licencia | homemade (3), hypShaman (2), 0mka (2) |
| Interfaz de pantalla | 15 | 15 | sin licencia | 0mka (7), Gert-Jan Akerboom (4), ash (2) |
| Partículas y efectos | 14 | 13 | sin licencia | ash (8), Gert-Jan Akerboom (3), Shiffty (1) |
| Pantalla de vídeo / TV / proyector / screenshare | 13 | 12 | sin licencia | ash (4), MetaRick (2), cru (2) |
| Cámara | 13 | 13 | sin licencia | Shiffty (5), ~/drdoge.eth (2), Saori (1) |
| Objeto agarrable / equipable / coleccionable | 12 | 12 | sin licencia | maximus (4), 0mka (3), ash (1) |
| Enjambres animados por instancias | 12 | 4 | sin licencia | Gert-Jan Akerboom (9), Valiant (2), Shiffty (1) |
| Vegetación por instancias | 11 | 10 | sin licencia | Gert-Jan Akerboom (9), Agent12 (1), 0mka (1) |
| Zona disparadora / proximidad / colisiones y raycast | 11 | 8 | sin licencia | ash (5), 0mka (2), Hyperfy (1) |
| Reproductor de audio / música / altavoz / instrumento / zona de voz | 9 | 9 | sin licencia | ash (2), hypShaman (2), Valiant (1) |
| Aviso a Discord / webhook / registro en relay | 9 | 6 | sin licencia | m₂ (2), Gert-Jan Akerboom (2), peezy (2) |
| Vehículo volador | 9 | 9 | sin licencia | ash (2), ~/drdoge.eth (2), vox (2) |
| Contador / temporizador / reloj / notificaciones | 8 | 7 | sin licencia | 0mka (4), ash (2), Lastraum - theforgecore.xyz (1) |
| Ascensor / plataforma móvil / saltos y movimiento especial | 8 | 8 | sin licencia | Dhin (3), peezy (1), Gert-Jan Akerboom (1) |
| Vehículo terrestre / bici / coche / tabla / raíl | 7 | 6 | sin licencia | ~/drdoge.eth (3), ash (2), 0mka (2) |
| Asiento / silla / sentarse | 7 | 6 | sin licencia | ~/drdoge.eth (2), ash (2), 0mka (1) |
| PNJ hostil / enemigo | 7 | 5 | sin licencia | ash (2), peezy (2), Shiffty (1) |
| PNJ con IA conversacional | 6 | 3 | sin licencia | HypPrivakos - HyperWorld.Host (2), 0mka (2), MetaMike (1) |
| Estación / selector de avatar | 6 | 4 | sin licencia | peezy (2), Shiffty (1), ash (1) |
| Gestos / emotes de avatar | 6 | 5 | sin licencia | ash (2), Shiffty (1), HowieDuhzit (1) |
| Minijuego / tablero / pista de baile / pelota | 6 | 5 | sin licencia | cru (3), Shiffty (1), peezy (1) |
| Puerta / token-gate / pago para entrar / nevera interactiva | 4 | 3 | sin licencia | peezy (2), hypShaman (1), ash (1) |
| **Total** | **342** | **291** | | |

## Table of apps (name, function, author, licence)

Variants of one app (v1/v2, `_1`, `-fixed`) are listed as separate entries; the priority column is per function group (see the proposal below).

| App | Function | Author | Licence | Priority |
|---|---|---|---|---|
| CampChairNORMALSIZEAVATARS | Asiento / silla / sentarse | ~/drdoge.eth | sin licencia | P1 |
| CampChairSMALLAVATARS | Asiento / silla / sentarse | ~/drdoge.eth | sin licencia | P1 |
| Seatv2 | Asiento / silla / sentarse | 0mka | sin licencia | P1 |
| Seat🪑 | Asiento / silla / sentarse | homemade | sin licencia | P1 |
| sit | Asiento / silla / sentarse | Wilson | sin licencia | P1 |
| SwivelChair | Asiento / silla / sentarse | ash | sin licencia | P1 |
| SwivelChair_1 | Asiento / silla / sentarse | ash | sin licencia | P1 |
| ButtonsUI | Contador / temporizador / reloj / notificaciones | 0mka | sin licencia | P1 |
| ClockUI | Contador / temporizador / reloj / notificaciones | 0mka | sin licencia | P1 |
| Counter | Contador / temporizador / reloj / notificaciones | ash | sin licencia | P1 |
| Counter_1 | Contador / temporizador / reloj / notificaciones | ash | sin licencia | P1 |
| Game_Timer | Contador / temporizador / reloj / notificaciones | 0mka | sin licencia | P1 |
| HelloUI | Contador / temporizador / reloj / notificaciones | 0mka | sin licencia | P1 |
| Notifications | Contador / temporizador / reloj / notificaciones | Lastraum - theforgecore.xyz | sin licencia | P1 |
| TImer | Contador / temporizador / reloj / notificaciones | MetaRick | sin licencia | P1 |
| Bio-Links | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Gert-Jan Akerboom | sin licencia | P1 |
| broke-rom | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | general hyper | sin licencia | P1 |
| Customizable_BreezeBoard | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Agent12 | sin licencia | P1 |
| Customizable_BreezeBoard_2 | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | 0mka | sin licencia | P1 |
| Framed_Image_v1.0 | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Valiant | sin licencia | P1 |
| Icons2_1 | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | peezy | sin licencia | P1 |
| Image | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | ash | sin licencia | P1 |
| Image | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Hyperfy | sin licencia | P1 |
| Locationator | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | MetaRick | sin licencia | P1 |
| Locationator_plus_InstanceId_1 | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | 0mka | sin licencia | P1 |
| Neon Sign | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Gert-Jan Akerboom | sin licencia | P1 |
| NEON_1 | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Gert-Jan Akerboom | sin licencia | P1 |
| NEON_2 | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Gert-Jan Akerboom | sin licencia | P1 |
| NeonSign | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | hypShaman | sin licencia | P1 |
| PlayerTag-UInew | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | ~/drdoge.eth | sin licencia | P1 |
| Ricky-3-2-show_chart | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | 0mka | sin licencia | P1 |
| rom2 | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | general hyper | sin licencia | P1 |
| Screen_UI_link_section | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Gert-Jan Akerboom | sin licencia | P1 |
| show_chart | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Ricky | sin licencia | P1 |
| Sign | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | ash | sin licencia | P1 |
| Text | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Hyperfy | sin licencia | P1 |
| Text_link_option | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | Gert-Jan Akerboom | sin licencia | P1 |
| UI_Billboard-Full | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | 0mka | sin licencia | P1 |
| uiImage_from_File | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | 0mka | sin licencia | P1 |
| uiImage_from_File-update1 | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | 0mka | sin licencia | P1 |
| uiImage_from_URL | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | 0mka | sin licencia | P1 |
| uiImageFromUrl | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | 0mka | sin licencia | P1 |
| WavePanel | Imagen / cartel / texto / letrero de neón / etiqueta en el mundo | cru | sin licencia | P1 |
| HyperPortal | Teletransporte / portal / punto de aparición | hypShaman | sin licencia | P1 |
| HyperPortal_-_fixed | Teletransporte / portal / punto de aparición | Agent12 | sin licencia | P1 |
| HyperPortal_1 | Teletransporte / portal / punto de aparición | MetaRick | sin licencia | P1 |
| HyperPortal_with_Set | Teletransporte / portal / punto de aparición | 0mka | sin licencia | P1 |
| HyperPortal_with_Set_Manual | Teletransporte / portal / punto de aparición | 0mka | sin licencia | P1 |
| Place🌀 | Teletransporte / portal / punto de aparición | homemade ~/0mka, b0gie | sin licencia | P1 |
| Portal🌀 | Teletransporte / portal / punto de aparición | homemade | sin licencia | P1 |
| Portal🌐 | Teletransporte / portal / punto de aparición | homemade | sin licencia | P1 |
| spawn | Teletransporte / portal / punto de aparición | Saori | sin licencia | P1 |
| Spawn_PlatformHYPERPEPE | Teletransporte / portal / punto de aparición | ~/drdoge.eth | sin licencia | P1 |
| Spawn_PlatformV2 | Teletransporte / portal / punto de aparición | ~/drdoge.eth | sin licencia | P1 |
| Sphere🌀 | Teletransporte / portal / punto de aparición | homemade | sin licencia | P1 |
| SPICEXPortal | Teletransporte / portal / punto de aparición | hypShaman | sin licencia | P1 |
| Teleport_Command | Teletransporte / portal / punto de aparición | ash | sin licencia | P1 |
| Teleport_Command_v2 | Teletransporte / portal / punto de aparición | ash | sin licencia | P1 |
| teleporter | Teletransporte / portal / punto de aparición | Saori | sin licencia | P1 |
| TeleportTriggerBox | Teletransporte / portal / punto de aparición | 𝕽𝖔𝖚𝖘𝖙𝖆𝖓 | sin licencia | P1 |
| Model | Zona disparadora / proximidad / colisiones y raycast | ash | sin licencia | P1 |
| Model | Zona disparadora / proximidad / colisiones y raycast | Hyperfy | sin licencia | P1 |
| n1-n1-05 | Zona disparadora / proximidad / colisiones y raycast | ash | sin licencia | P1 |
| Omka-2-21-uiBillboard_-_proximity_trigger | Zona disparadora / proximidad / colisiones y raycast | 0mka | sin licencia | P1 |
| Physics_-_Contacts__Tags | Zona disparadora / proximidad / colisiones y raycast | ash | sin licencia | P1 |
| Physics_-_Raycast_Tags | Zona disparadora / proximidad / colisiones y raycast | ash | sin licencia | P1 |
| Physics_-_Triggers__Tags | Zona disparadora / proximidad / colisiones y raycast | ash | sin licencia | P1 |
| Raycaster | Zona disparadora / proximidad / colisiones y raycast | Saori | sin licencia | P1 |
| Spherea | Zona disparadora / proximidad / colisiones y raycast | hypShaman | sin licencia | P1 |
| Spherea | Zona disparadora / proximidad / colisiones y raycast | homemade | sin licencia | P1 |
| uiBillboard_-_proximity_trigger | Zona disparadora / proximidad / colisiones y raycast | 0mka | sin licencia | P1 |
| dash | Ascensor / plataforma móvil / saltos y movimiento especial | peezy | sin licencia | P2 |
| ElevatorForVox | Ascensor / plataforma móvil / saltos y movimiento especial | Gert-Jan Akerboom | sin licencia | P2 |
| Launchpad | Ascensor / plataforma móvil / saltos y movimiento especial | Dhin | sin licencia | P2 |
| MoonJump | Ascensor / plataforma móvil / saltos y movimiento especial | 0mka | sin licencia | P2 |
| Platforms | Ascensor / plataforma móvil / saltos y movimiento especial | hypShaman | sin licencia | P2 |
| SmoothElevator | Ascensor / plataforma móvil / saltos y movimiento especial | ash | sin licencia | P2 |
| Super_Run | Ascensor / plataforma móvil / saltos y movimiento especial | Dhin | sin licencia | P2 |
| Wall_Hang | Ascensor / plataforma móvil / saltos y movimiento especial | Dhin | sin licencia | P2 |
| ActionBar_Saori | Interfaz de pantalla | Saori | sin licencia | P2 |
| ArrayVectorProps | Interfaz de pantalla | ~/MayD524/Hyperfy | sin licencia | P2 |
| Gamepad | Interfaz de pantalla | 0mka | sin licencia | P2 |
| hover-cursor-test | Interfaz de pantalla | Gert-Jan Akerboom | sin licencia | P2 |
| Items_UI | Interfaz de pantalla | 0mka | sin licencia | P2 |
| Player_Transforms | Interfaz de pantalla | Gert-Jan Akerboom | sin licencia | P2 |
| position | Interfaz de pantalla | 0mka | sin licencia | P2 |
| Prim_Tester | Interfaz de pantalla | ash | sin licencia | P2 |
| ScreenUI-BottomRight | Interfaz de pantalla | 0mka | sin licencia | P2 |
| ScreenUI-Radial-1. | Interfaz de pantalla | 0mka | sin licencia | P2 |
| ScreenUI-Right | Interfaz de pantalla | 0mka | sin licencia | P2 |
| ScreenUI-TopRight | Interfaz de pantalla | 0mka | sin licencia | P2 |
| Weightpaint_ScreenUI_test1 | Interfaz de pantalla | Gert-Jan Akerboom | sin licencia | P2 |
| who_there | Interfaz de pantalla | Gert-Jan Akerboom | sin licencia | P2 |
| WorldUISpace | Interfaz de pantalla | ash | sin licencia | P2 |
| Attachable | Objeto agarrable / equipable / coleccionable | ash | sin licencia | P2 |
| Book_-_Flip | Objeto agarrable / equipable / coleccionable | Dhin | sin licencia | P2 |
| ccp_chicken | Objeto agarrable / equipable / coleccionable | ~/drdoge.eth | sin licencia | P2 |
| Chicken_with_Hat | Objeto agarrable / equipable / coleccionable | Gert-Jan Akerboom | sin licencia | P2 |
| Health | Objeto agarrable / equipable / coleccionable | maximus | sin licencia | P2 |
| Loot | Objeto agarrable / equipable / coleccionable | maximus | sin licencia | P2 |
| Loot-PlanetLava | Objeto agarrable / equipable / coleccionable | maximus | sin licencia | P2 |
| Loot-Ringed_Planet | Objeto agarrable / equipable / coleccionable | maximus | sin licencia | P2 |
| Networked_Grabbable | Objeto agarrable / equipable / coleccionable | Saori | sin licencia | P2 |
| QuestItemBasic | Objeto agarrable / equipable / coleccionable | 0mka | sin licencia | P2 |
| QuestItemUI | Objeto agarrable / equipable / coleccionable | 0mka | sin licencia | P2 |
| szjanko-2-11-dice | Objeto agarrable / equipable / coleccionable | 0mka | sin licencia | P2 |
| CONFETTT_PPOT | Partículas y efectos | Gert-Jan Akerboom | sin licencia | P2 |
| eel_add_particles1 | Partículas y efectos | Gert-Jan Akerboom | sin licencia | P2 |
| eel_add_particles1_1 | Partículas y efectos | ash | sin licencia | P2 |
| Explosion_Sprites | Partículas y efectos | ash | sin licencia | P2 |
| Fire | Partículas y efectos | ash | sin licencia | P2 |
| Fireworks4 | Partículas y efectos | Gert-Jan Akerboom | sin licencia | P2 |
| Glow_Dust | Partículas y efectos | ash | sin licencia | P2 |
| Healing_Aura | Partículas y efectos | ash | sin licencia | P2 |
| ParticleFun | Partículas y efectos | Shiffty | sin licencia | P2 |
| Smoke | Partículas y efectos | ash | sin licencia | P2 |
| SpeedTrail_v0.1 | Partículas y efectos | Valiant | sin licencia | P2 |
| SS3 | Partículas y efectos | ~/drdoge.eth | sin licencia | P2 |
| Tornado | Partículas y efectos | ash | sin licencia | P2 |
| Water_Fountain | Partículas y efectos | ash | sin licencia | P2 |
| HyperFridge | Puerta / token-gate / pago para entrar / nevera interactiva | hypShaman | sin licencia | P2 |
| HyperFridge_1 | Puerta / token-gate / pago para entrar / nevera interactiva | ash | sin licencia | P2 |
| PAY_TO_ENTER_DOOR | Puerta / token-gate / pago para entrar / nevera interactiva | peezy | sin licencia | P2 |
| TOKEN_GATE | Puerta / token-gate / pago para entrar / nevera interactiva | peezy | sin licencia | P2 |
| anybox | Reproductor de audio / música / altavoz / instrumento / zona de voz | ash | sin licencia | P2 |
| BasicMp3Player | Reproductor de audio / música / altavoz / instrumento / zona de voz | Valiant | sin licencia | P2 |
| Boombox | Reproductor de audio / música / altavoz / instrumento / zona de voz | Dhin | sin licencia | P2 |
| Drumpad | Reproductor de audio / música / altavoz / instrumento / zona de voz | cru | sin licencia | P2 |
| HyperSpeaker | Reproductor de audio / música / altavoz / instrumento / zona de voz | hypShaman | sin licencia | P2 |
| JUKEBOX_UI | Reproductor de audio / música / altavoz / instrumento / zona de voz | ~/drdoge.eth | sin licencia | P2 |
| SmolWrld | Reproductor de audio / música / altavoz / instrumento / zona de voz | hypShaman | sin licencia | P2 |
| Sphere🔊 | Reproductor de audio / música / altavoz / instrumento / zona de voz | homemade | sin licencia | P2 |
| VoiceZone | Reproductor de audio / música / altavoz / instrumento / zona de voz | ash | sin licencia | P2 |
| BlockTesting | Gestos / emotes de avatar | Shiffty | sin licencia | P3 |
| Emote_Command | Gestos / emotes de avatar | ash | sin licencia | P3 |
| Emote_Rom | Gestos / emotes de avatar | HowieDuhzit | sin licencia | P3 |
| Emote_Rom_1 | Gestos / emotes de avatar | ~/drdoge.eth | sin licencia | P3 |
| Emotes | Gestos / emotes de avatar | ash | sin licencia | P3 |
| EmotesR | Gestos / emotes de avatar | 𝕽𝖔𝖚𝖘𝖙𝖆𝖓 | sin licencia | P3 |
| AlleySign | Animación de malla o textura | MetaRick | sin licencia | P4 |
| AnimatedNPCMANNEQUINACTOR | Animación de malla o textura | ~/drdoge.eth | sin licencia | P4 |
| Cube_1 | Animación de malla o textura | ash | sin licencia | P4 |
| firstHYP | Animación de malla o textura | vox | sin licencia | P4 |
| firstHYPv2 | Animación de malla o textura | vox | sin licencia | P4 |
| hexagonal_test_basic | Animación de malla o textura | cru | sin licencia | P4 |
| hexagonal_test_networked | Animación de malla o textura | cru | sin licencia | P4 |
| Jumping_Frog | Animación de malla o textura | fractilians | sin licencia | P4 |
| Model-VCA | Animación de malla o textura | 0mka | sin licencia | P4 |
| Model_-_animation | Animación de malla o textura | ash | sin licencia | P4 |
| RGB_CUBE | Animación de malla o textura | 0mka | sin licencia | P4 |
| SAMPLEHYP | Animación de malla o textura | vox | sin licencia | P4 |
| scrolltest | Animación de malla o textura | hypShaman | sin licencia | P4 |
| testProp2 | Animación de malla o textura | cru | sin licencia | P4 |
| Trippy_Floor | Animación de malla o textura | Shiffty | sin licencia | P4 |
| WaterPlane | Animación de malla o textura | Shiffty | sin licencia | P4 |
| WaterPlanet | Animación de malla o textura | 🆂🅴🅱🅶🅰 | sin licencia | P4 |
| WaterPlanet_fixed | Animación de malla o textura | vox | sin licencia | P4 |
| Wolf_Maro | Animación de malla o textura | ash | sin licencia | P4 |
| CameraLaser | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Shiffty | sin licencia | P4 |
| healthbar | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Saori | sin licencia | P4 |
| laser.glb | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ash | sin licencia | P4 |
| Laser_Rifle1 | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ~/drdoge.eth | sin licencia | P4 |
| laser_rifleNEW | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ~/drdoge.eth | sin licencia | P4 |
| Machine_Gun_v8 | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Saori | sin licencia | P4 |
| Machine_Gun_With_Animation | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Saori | sin licencia | P4 |
| MINI-Nuke | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ~/drdoge.eth | sin licencia | P4 |
| MINI-NukePORTAL | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ~/drdoge.eth | sin licencia | P4 |
| Player_Projectiles | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ash | sin licencia | P4 |
| Prism | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ash | sin licencia | P4 |
| Projectiles | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Shiffty | sin licencia | P4 |
| PvE_Sword | Arma / disparo / proyectiles / sistema de combate PvP-PvE | peezy | sin licencia | P4 |
| PvP_Core_with_spawns | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Saori | sin licencia | P4 |
| PVPblasterLATEST | Arma / disparo / proyectiles / sistema de combate PvP-PvE | hypShaman | sin licencia | P4 |
| RAD-ZONE | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ~/drdoge.eth | sin licencia | P4 |
| RayBeam | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ash | sin licencia | P4 |
| RayBeam_Saori | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Saori | sin licencia | P4 |
| Rocket_Launcher_DiscordMsg | Arma / disparo / proyectiles / sistema de combate PvP-PvE | 0mka | sin licencia | P4 |
| Rocket_Launcher_V1 | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Gert-Jan Akerboom | sin licencia | P4 |
| Rocket_Launcher_V3 | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Gert-Jan Akerboom | sin licencia | P4 |
| RocketGlobalColl | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Gert-Jan Akerboom | sin licencia | P4 |
| Sword | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ash | sin licencia | P4 |
| Sword_l_r | Arma / disparo / proyectiles / sistema de combate PvP-PvE | 0mka | sin licencia | P4 |
| Vanguard | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ash | sin licencia | P4 |
| Wasteland-HUD | Arma / disparo / proyectiles / sistema de combate PvP-PvE | ~/drdoge.eth | sin licencia | P4 |
| Weapon_Animation_Override | Arma / disparo / proyectiles / sistema de combate PvP-PvE | Saori | sin licencia | P4 |
| Weapons_Radial | Arma / disparo / proyectiles / sistema de combate PvP-PvE | 0mka | sin licencia | P4 |
| beacon | Aviso a Discord / webhook / registro en relay | m₂ | sin licencia | P4 |
| beacon-dev | Aviso a Discord / webhook / registro en relay | m₂ | sin licencia | P4 |
| Discord3 | Aviso a Discord / webhook / registro en relay | Gert-Jan Akerboom | sin licencia | P4 |
| discord_1 | Aviso a Discord / webhook / registro en relay | peezy | sin licencia | P4 |
| HyperBeacon | Aviso a Discord / webhook / registro en relay | hypShaman | sin licencia | P4 |
| HyperBeacon_v2 | Aviso a Discord / webhook / registro en relay | maximus | sin licencia | P4 |
| m2-2-4-beacon-dev | Aviso a Discord / webhook / registro en relay | 0mka | sin licencia | P4 |
| spl_tokens | Aviso a Discord / webhook / registro en relay | peezy | sin licencia | P4 |
| TriggerZone | Aviso a Discord / webhook / registro en relay | Gert-Jan Akerboom | sin licencia | P4 |
| cam_raycast_action_bar | Cámara | Saori | sin licencia | P4 |
| Camera_Trigger | Cámara | Dhin | sin licencia | P4 |
| CameraManager | Cámara | Shiffty | sin licencia | P4 |
| CameraManagerFreecamToggle | Cámara | Shiffty | sin licencia | P4 |
| CameraManagerTest | Cámara | Shiffty | sin licencia | P4 |
| CameraSwitcherAnchor | Cámara | ~/drdoge.eth | sin licencia | P4 |
| Free_Camera | Cámara | vox | sin licencia | P4 |
| Free_Camera_Fixed_Lerp | Cámara | Shiffty | sin licencia | P4 |
| gamer_mode_1 | Cámara | peezy | sin licencia | P4 |
| Geoff📹 | Cámara | homemade | sin licencia | P4 |
| Idle_Camera_System | Cámara | ~/drdoge.eth | sin licencia | P4 |
| IdleCameraSystem | Cámara | HowieDuhzit | sin licencia | P4 |
| vibe | Cámara | Shiffty | sin licencia | P4 |
| Alien_Planet | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ash | sin licencia | P4 |
| Clouds | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ~/drdoge.eth | sin licencia | P4 |
| clouds2 | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ~/drdoge.eth | sin licencia | P4 |
| clouds3 | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ~/drdoge.eth | sin licencia | P4 |
| DAY_NIGHT_WEATHER_CURRENT | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ~/drdoge.eth | sin licencia | P4 |
| Fog | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ash | sin licencia | P4 |
| HyperCloud | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ash | sin licencia | P4 |
| LUHTA | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | vox | sin licencia | P4 |
| Rain | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ash | sin licencia | P4 |
| Rain | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | Gert-Jan Akerboom | sin licencia | P4 |
| RainV3 | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | Gert-Jan Akerboom | sin licencia | P4 |
| RainV4 | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | Gert-Jan Akerboom | sin licencia | P4 |
| Solar_Panel | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ~/drdoge.eth | sin licencia | P4 |
| Solar_Panel_-_sundown | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ash | sin licencia | P4 |
| Solar_Panel_1 | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ash | sin licencia | P4 |
| The_Grid | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ash | sin licencia | P4 |
| The_Meadow | Día-noche, cielo, sol, clima, nubes, niebla, lluvia | ash | sin licencia | P4 |
| Bats_v1 | Enjambres animados por instancias | Valiant | sin licencia | P4 |
| Butterfly_Swarm_V1 | Enjambres animados por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Butterfly_Swarm_V2a | Enjambres animados por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Butterfly_Swarm_V3 | Enjambres animados por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Butterfly_Swarm_V4 | Enjambres animados por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Butterfly_Swarm_V5 | Enjambres animados por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Butterfly_Swarm_V6 | Enjambres animados por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Butterfly_Swarm_V6_Hyperfly_edition | Enjambres animados por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Butterfly_Swarm_V6_Hyperfly_edition2 | Enjambres animados por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Butterfly_Swarm_V6_Hyperfly_edition2_BW | Enjambres animados por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| ButterflyFlight | Enjambres animados por instancias | Shiffty | sin licencia | P4 |
| Eagles_v1 | Enjambres animados por instancias | Valiant | sin licencia | P4 |
| Auto_Assigned_Persistent_Avatar_Station | Estación / selector de avatar | peezy | sin licencia | P4 |
| Avatar_Station | Estación / selector de avatar | Shiffty | sin licencia | P4 |
| Avatar_Station1 | Estación / selector de avatar | peezy | sin licencia | P4 |
| Avatar_Station_-_fixed | Estación / selector de avatar | ash | sin licencia | P4 |
| Avatar_Station_4 | Estación / selector de avatar | MetaRick | sin licencia | P4 |
| Avatar_StationSCALE | Estación / selector de avatar | ~/drdoge.eth | sin licencia | P4 |
| DanceFloor | Minijuego / tablero / pista de baile / pelota | Shiffty | sin licencia | P4 |
| game | Minijuego / tablero / pista de baile / pelota | peezy | sin licencia | P4 |
| hyperball | Minijuego / tablero / pista de baile / pelota | Saori | sin licencia | P4 |
| SimonSays_Screen | Minijuego / tablero / pista de baile / pelota | cru | sin licencia | P4 |
| SimonSays_Screen_2 | Minijuego / tablero / pista de baile / pelota | cru | sin licencia | P4 |
| SimonSaysBoard | Minijuego / tablero / pista de baile / pelota | cru | sin licencia | P4 |
| Altman_Rat | PNJ acompañante / mascota / seguidor / rover recolector | MetaRick | sin licencia | P4 |
| Companion3 | PNJ acompañante / mascota / seguidor / rover recolector | ~/drdoge.eth | sin licencia | P4 |
| Companion5.1 | PNJ acompañante / mascota / seguidor / rover recolector | ~/drdoge.eth | sin licencia | P4 |
| Companion_v8 | PNJ acompañante / mascota / seguidor / rover recolector | ~/drdoge.eth | sin licencia | P4 |
| Elon_Rat | PNJ acompañante / mascota / seguidor / rover recolector | MetaRick | sin licencia | P4 |
| Follower | PNJ acompañante / mascota / seguidor / rover recolector | ash | sin licencia | P4 |
| Follower_1 | PNJ acompañante / mascota / seguidor / rover recolector | MetaRick | sin licencia | P4 |
| GroupieV1 | PNJ acompañante / mascota / seguidor / rover recolector | b34k3r | sin licencia | P4 |
| Mato_Pet_v2 | PNJ acompañante / mascota / seguidor / rover recolector | ~/MayD524/Hyperfy | sin licencia | P4 |
| Mato_Pets | PNJ acompañante / mascota / seguidor / rover recolector | ~/MayD524/Hyperfy | sin licencia | P4 |
| PingScript4CompanionNEW | PNJ acompañante / mascota / seguidor / rover recolector | ~/drdoge.eth | sin licencia | P4 |
| PingScriptFORcompanion | PNJ acompañante / mascota / seguidor / rover recolector | ~/drdoge.eth | sin licencia | P4 |
| Quadduckhead_beadbeard-follows | PNJ acompañante / mascota / seguidor / rover recolector | ~/MayD524/Hyperfy | sin licencia | P4 |
| Rover-LavaCargo | PNJ acompañante / mascota / seguidor / rover recolector | maximus | sin licencia | P4 |
| Rover-RingedPlanet | PNJ acompañante / mascota / seguidor / rover recolector | maximus | sin licencia | P4 |
| Rover.2.11 | PNJ acompañante / mascota / seguidor / rover recolector | maximus | sin licencia | P4 |
| SecurityBot | PNJ acompañante / mascota / seguidor / rover recolector | MetaRick | sin licencia | P4 |
| app_1 | PNJ con IA conversacional | HypPrivakos - HyperWorld.Host | sin licencia | P4 |
| app_2 | PNJ con IA conversacional | HypPrivakos - HyperWorld.Host | sin licencia | P4 |
| HP-eliza-2-1-app_1 | PNJ con IA conversacional | 0mka | sin licencia | P4 |
| LLM_NPC | PNJ con IA conversacional | MetaMike | sin licencia | P4 |
| saori-2-5-trump-agent | PNJ con IA conversacional | 0mka | sin licencia | P4 |
| trump-agent | PNJ con IA conversacional | Saori | sin licencia | P4 |
| Mob_-_Skelly | PNJ hostil / enemigo | ash | sin licencia | P4 |
| NavMesh | PNJ hostil / enemigo | Shiffty | sin licencia | P4 |
| NPC | PNJ hostil / enemigo | ash | sin licencia | P4 |
| NPC_10 | PNJ hostil / enemigo | peezy | sin licencia | P4 |
| NPC_9 | PNJ hostil / enemigo | peezy | sin licencia | P4 |
| NPC_Prisoner | PNJ hostil / enemigo | b34k3r | sin licencia | P4 |
| Raptor_random_loc | PNJ hostil / enemigo | Gert-Jan Akerboom | sin licencia | P4 |
| 360_Video_Viewer | Pantalla de vídeo / TV / proyector / screenshare | ash | sin licencia | P4 |
| 360Player_Mono | Pantalla de vídeo / TV / proyector / screenshare | MetaRick | sin licencia | P4 |
| Curved_Main_Screen_2 | Pantalla de vídeo / TV / proyector / screenshare | Alephic | sin licencia | P4 |
| Curved_Video_Viewer | Pantalla de vídeo / TV / proyector / screenshare | ash | sin licencia | P4 |
| CurvedVid_with_link_input | Pantalla de vídeo / TV / proyector / screenshare | MetaRick | sin licencia | P4 |
| FTV | Pantalla de vídeo / TV / proyector / screenshare | ~/drdoge.eth | sin licencia | P4 |
| Projector | Pantalla de vídeo / TV / proyector / screenshare | cru | sin licencia | P4 |
| Projector_v2 | Pantalla de vídeo / TV / proyector / screenshare | cru | sin licencia | P4 |
| Screen | Pantalla de vídeo / TV / proyector / screenshare | ash | sin licencia | P4 |
| Video | Pantalla de vídeo / TV / proyector / screenshare | Hyperfy | sin licencia | P4 |
| Video_Channel_Changer | Pantalla de vídeo / TV / proyector / screenshare | ash | sin licencia | P4 |
| Video_with_player_UI | Pantalla de vídeo / TV / proyector / screenshare | Gert-Jan Akerboom | sin licencia | P4 |
| VideoPlayer | Pantalla de vídeo / TV / proyector / screenshare | Valiant | sin licencia | P4 |
| Autonomous_Resource_Network | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | MetaMike | sin licencia | P4 |
| BloomBlock | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | ash | sin licencia | P4 |
| CampfireHomeLATEST | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | ~/drdoge.eth | sin licencia | P4 |
| DeepWiki | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | 0mka | sin licencia | P4 |
| emmissivevertexPaintTest | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | hypShaman | sin licencia | P4 |
| env | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | peezy | sin licencia | P4 |
| followcurve6 | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | Gert-Jan Akerboom | sin licencia | P4 |
| GIS_Orb | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | cru | sin licencia | P4 |
| Grid_Floor | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | HowieDuhzit | sin licencia | P4 |
| Grid_Floor_-_BlurFix | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | ash | sin licencia | P4 |
| Grid_Floor_v2 | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | ash | sin licencia | P4 |
| HexaFloor-v0 | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | maximus | sin licencia | P4 |
| Hexagons | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | ash | sin licencia | P4 |
| LaunchParty | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | Shiffty | sin licencia | P4 |
| monkey_head | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | hypShaman | sin licencia | P4 |
| ObjectDistribution | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | Shiffty | sin licencia | P4 |
| ProceduralCity | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | Shiffty | sin licencia | P4 |
| RGB_Block1 | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | hypShaman | sin licencia | P4 |
| Rock | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | ToxSam - IBIH | sin licencia | P4 |
| ScaledWorlds | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | ~/MayD524/Hyperfy | sin licencia | P4 |
| stadium | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | MetaMike | sin licencia | P4 |
| test_level | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | Saori | sin licencia | P4 |
| vertexPaintTest | Suelo / rejilla / hexágonos / escenario y modelos 3D estáticos | hypShaman | sin licencia | P4 |
| aloe.glb | Vegetación por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Aloe_vera | Vegetación por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Amanita | Vegetación por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| bending_leaf_V1 | Vegetación por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Forest | Vegetación por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| generate_monstera_V1 | Vegetación por instancias | Agent12 | sin licencia | P4 |
| Gert-2-1-aloe | Vegetación por instancias | 0mka | sin licencia | P4 |
| Grass and Flowers | Vegetación por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Grass_V1 | Vegetación por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| Grass_V3 | Vegetación por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| SplinePineV1 | Vegetación por instancias | Gert-Jan Akerboom | sin licencia | P4 |
| BIKE-fallout | Vehículo terrestre / bici / coche / tabla / raíl | ~/drdoge.eth | sin licencia | P4 |
| BIKE-fallout2 | Vehículo terrestre / bici / coche / tabla / raíl | ~/drdoge.eth | sin licencia | P4 |
| car1 | Vehículo terrestre / bici / coche / tabla / raíl | ash | sin licencia | P4 |
| car1-v2 | Vehículo terrestre / bici / coche / tabla / raíl | ash | sin licencia | P4 |
| HYPER_RAILv2 | Vehículo terrestre / bici / coche / tabla / raíl | ~/drdoge.eth | sin licencia | P4 |
| HyperBoardV1 | Vehículo terrestre / bici / coche / tabla / raíl | 0mka | sin licencia | P4 |
| hyperducksitfighter | Vehículo terrestre / bici / coche / tabla / raíl | 0mka | sin licencia | P4 |
| Builder_Drone | Vehículo volador | devbyte | sin licencia | P4 |
| Builder_Drone_X501 | Vehículo volador | ash | sin licencia | P4 |
| chinookNEW | Vehículo volador | ~/drdoge.eth | sin licencia | P4 |
| drone.glb | Vehículo volador | peezy | sin licencia | P4 |
| F117NH | Vehículo volador | ~/drdoge.eth | sin licencia | P4 |
| HELIv2 | Vehículo volador | vox | sin licencia | P4 |
| HELIv4 | Vehículo volador | vox | sin licencia | P4 |
| Plane | Vehículo volador | ash | sin licencia | P4 |
| VehicleFlight | Vehículo volador | Shiffty | sin licencia | P4 |

## Ten pieces the house library should have first

Made by us from the function (Copy · Transform · Combine: we copy the *idea* the community validated, change it to server-decided data pieces, combine it with the wire D-041). Cost = stories of ≤30 min, from `work/hyperfy-estudio/FICHAS-PIEZAS.md` where a sheet exists, otherwise an estimate by Ursa (marked ~). Before building each, check `docs/BACKLOG.md` and `docs/HYPERFY2-PARIDAD.md`: some may already exist in main in part.

| # | Piece | Community demand (apps) | Licence route | Cost |
|---|---|---|---|---|
| 1 | Wire of notices: zone or button emits, receivers show/hide/teleport/step/sound | zones 8 + hide/show 35 + buttons 30 | own | 6 (D-041) |
| 2 | Teleporter / portal / spawn point | Teleporte 12 | own | ~3 |
| 3 | Lock with code or key + numeric keypad with HTML twin | doors 3, passwords 6, buttons 30 | own | 4 (D-042) |
| 4 | Timer and counter on screen | Contador 7 | own | 3 (D-044) |
| 5 | Seat / sit | Asiento 6 | own | ~2 |
| 6 | Image / sign / text in the world with HTML twin | Imagen y cartel 22 | own (first slice in lote 5, H6) | ~3 left |
| 7 | Move and rotate objects with duration (door, lift, platform) | Ascensor 8 + animation 17 | own | 4 (D-043) |
| 8 | Sound source in an object or point (music and effects groups) | Audio 9 | own (first slice in lote 6, H5) | ~2 left |
| 9 | Particle effects by preset (fire, smoke, confetti, fountain) | Partículas 13 | own, instanced | ~4 |
| 10 | Safe-position respawn when falling | Ascensor y saltos 8 | own | 2 (D-045) |

Total about 33 stories of ≤30 min, around five night trains. Left out on purpose: weapons/combat (25 apps, a design decision first), vehicles, hostile mobs, token gates and pay-to-enter (money: Pablo decides), Discord/Solana notices (data to third parties: lawyers first).

## Not verified

- Function assignment is by rules over name/description/tags, not app by app. The licence of each individual `.hyp` was not inspected inside the file; the finding rests on the catalog fields and the repository root.
- Costs marked ~ are estimates, not measurements.
