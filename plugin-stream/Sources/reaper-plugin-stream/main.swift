import Foundation
import ScreenCaptureKit
import CoreImage
import CoreGraphics
import Network

final class CaptureService: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private let queue=DispatchQueue(label:"reaper.touch.capture",qos:.userInteractive)
    private let context=CIContext(options:[.cacheIntermediates:false])
    private let lock=NSLock(); private var frame=Data(); private var window:SCWindow?; private var stream:SCStream?
    func latest()->Data { lock.lock();defer{lock.unlock()};return frame }
    func bounds()->CGRect { window?.frame ?? .zero }
    func start() async throws {
        let content=try await SCShareableContent.excludingDesktopWindows(true,onScreenWindowsOnly:true)
        guard let candidate=content.windows.filter({$0.owningApplication?.bundleIdentifier=="com.cockos.reaper" && !($0.title ?? "").isEmpty}).sorted(by:{$0.frame.width*$0.frame.height < $1.frame.width*$1.frame.height}).first else { throw NSError(domain:"REAPERPluginStream",code:1,userInfo:[NSLocalizedDescriptionKey:"No visible REAPER FX window found. Open an FX window first."]) }
        window=candidate; let filter=SCContentFilter(desktopIndependentWindow:candidate); let config=SCStreamConfiguration();config.width=min(1600,Int(candidate.frame.width*2));config.height=min(1200,Int(candidate.frame.height*2));config.minimumFrameInterval=CMTime(value:1,timescale:30);config.queueDepth=3;config.showsCursor=false;config.capturesAudio=false
        let stream=SCStream(filter:filter,configuration:config,delegate:self);try stream.addStreamOutput(self,type:SCStreamOutputType.screen,sampleHandlerQueue:queue);self.stream=stream;try await stream.startCapture();print("Capturing \(candidate.title ?? \"Untitled FX\") [\(config.width)x\(config.height)]")
    }
    func stream(_ stream:SCStream,didStopWithError error:Error){fputs("Capture stopped: \(error)\n",stderr)}
    func stream(_ stream:SCStream,didOutputSampleBuffer sampleBuffer:CMSampleBuffer,of type:SCStreamOutputType){guard type == .screen,let imageBuffer=sampleBuffer.imageBuffer else{return};let image=CIImage(cvImageBuffer:imageBuffer);let cs=CGColorSpace(name:CGColorSpace.sRGB)!;guard let data=context.jpegRepresentation(of:image,colorSpace:cs,options:[kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption:0.72]) else{return};lock.lock();frame=data;lock.unlock()}
    func input(action:String,x:Double,y:Double){guard let window else{return};let point=CGPoint(x:window.frame.minX+CGFloat(x)*window.frame.width,y:window.frame.minY+CGFloat(y)*window.frame.height);let type:CGEventType=action=="down" ? .leftMouseDown : action=="up" ? .leftMouseUp : .leftMouseDragged;CGEvent(mouseEventSource:nil,mouseType:type,mouseCursorPosition:point,mouseButton:.left)?.post(tap:.cghidEventTap)}
}

final class HTTPServer: @unchecked Sendable {
    let capture:CaptureService;let listener:NWListener
    init(capture:CaptureService) throws {self.capture=capture;let parameters=NWParameters.tcp;parameters.requiredLocalEndpoint = .hostPort(host:"127.0.0.1",port:47831);listener=try NWListener(using:parameters)}
    func start(){listener.newConnectionHandler={ [capture] connection in connection.start(queue:.global(qos:.userInteractive));connection.receive(minimumIncompleteLength:1,maximumLength:65536){data,_,_,_ in guard let data,let request=String(data:data,encoding:.utf8) else{connection.cancel();return};if request.hasPrefix("GET /stream.mjpeg"){Self.stream(connection,capture)}else if request.hasPrefix("POST /input"){let body=request.components(separatedBy:"\r\n\r\n").dropFirst().joined(separator:"\r\n\r\n");if let data=body.data(using:.utf8),let json=try? JSONSerialization.jsonObject(with:data) as? [String:Any],let action=json["action"] as? String,let x=json["x"] as? Double,let y=json["y"] as? Double{capture.input(action:action,x:x,y:y)};connection.send(content:"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n".data(using:.utf8),completion:.contentProcessed{_ in connection.cancel()})}else{connection.cancel()}}};listener.start(queue:.main);print("Plugin stream: http://127.0.0.1:47831/stream.mjpeg")}
    static func stream(_ connection:NWConnection,_ capture:CaptureService){let header="HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=frame\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n".data(using:.utf8)!;connection.send(content:header,completion:.contentProcessed{error in if error == nil{sendFrame(connection,capture)}})}
    static func sendFrame(_ connection:NWConnection,_ capture:CaptureService){let frame=capture.latest();if frame.isEmpty{DispatchQueue.global().asyncAfter(deadline:.now()+0.04){sendFrame(connection,capture)};return};var packet=Data("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: \(frame.count)\r\n\r\n".utf8);packet.append(frame);packet.append(Data("\r\n".utf8));connection.send(content:packet,completion:.contentProcessed{error in if error == nil{DispatchQueue.global().asyncAfter(deadline:.now()+0.033){sendFrame(connection,capture)}}})}
}

let capture=CaptureService()
Task {do{try await capture.start();let server=try HTTPServer(capture:capture);server.start()}catch{fputs("REAPER Plugin Stream: \(error.localizedDescription)\n",stderr);exit(1)}}
dispatchMain()
